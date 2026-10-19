import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../index.js';
import { query } from '../db/pool.js';

describe('Roster Management & CSV Ingestion Integration Tests', () => {
  let app: FastifyInstance;
  let adminCookie: string;
  let ccCookie: string;
  let studentCookie: string;

  let mumbaiCentreId: string;
  let atcCentreId: string;
  let pgcpAcCourseId: string;
  let batchId: string;

  beforeAll(async () => {
    app = buildApp();
    await app.ready();

    // Fetch seed IDs
    const cRes = await query(`SELECT id, name FROM public.centres WHERE name IN ('C-DAC Mumbai', 'Test ATC')`);
    mumbaiCentreId = cRes.rows.find((r) => r.name === 'C-DAC Mumbai')?.id;
    atcCentreId = cRes.rows.find((r) => r.name === 'Test ATC')?.id;

    const coRes = await query(`SELECT id FROM public.courses WHERE code = 'PGCP-AC'`);
    pgcpAcCourseId = coRes.rows[0]?.id;

    const bRes = await query(`SELECT id FROM public.batches WHERE label = 'Aug 2026'`);
    batchId = bRes.rows[0]?.id;

    // Login Admin
    const adminLogin = await app.inject({
      method: 'POST',
      url: '/auth/dev-login',
      payload: { email: 'admin@test.local' },
    });
    adminCookie = adminLogin.headers['set-cookie'] as string;

    // Login CC (Mumbai)
    const ccLogin = await app.inject({
      method: 'POST',
      url: '/auth/dev-login',
      payload: { email: 'cc@test.local' },
    });
    ccCookie = ccLogin.headers['set-cookie'] as string;

    // Login Student
    const studentLogin = await app.inject({
      method: 'POST',
      url: '/auth/dev-login',
      payload: { email: 'student1@test.local' },
    });
    studentCookie = studentLogin.headers['set-cookie'] as string;
  });

  afterAll(async () => {
    await app.close();
  });

  it('1. Rejects unauthenticated and student access with 401/403', async () => {
    const unauth = await app.inject({
      method: 'GET',
      url: '/api/roster',
    });
    expect(unauth.statusCode).toBe(401);

    const studentReq = await app.inject({
      method: 'GET',
      url: '/api/roster',
      headers: { cookie: studentCookie },
    });
    expect(studentReq.statusCode).toBe(403);
    expect(JSON.parse(studentReq.body).error).toContain('Staff access required');
  });

  it('2. CC can list students within their managed centre', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/roster?centre_id=${mumbaiCentreId}&course_id=${pgcpAcCourseId}`,
      headers: { cookie: ccCookie },
    });

    expect(res.statusCode).toBe(200);
    const students = JSON.parse(res.body);
    expect(Array.isArray(students)).toBe(true);
    expect(students.length).toBeGreaterThanOrEqual(2);
    expect(students.some((s: any) => s.email === 'student1@test.local')).toBe(true);
    expect(students.some((s: any) => s.email === 'student2@test.local')).toBe(true);
    // Student in ATC should not be visible to Mumbai CC
    expect(students.some((s: any) => s.email === 'student3@test.local')).toBe(false);
  });

  it('3. Rejects roster CSV upload with malformed emails or missing PRNs', async () => {
    const invalidPayload = {
      students: [
        {
          email: 'invalid-email',
          prn: 'PRN999',
          full_name: 'Test Student',
          batch_id: batchId,
          centre_id: mumbaiCentreId,
          course_id: pgcpAcCourseId,
        },
      ],
    };

    const res = await app.inject({
      method: 'POST',
      url: '/api/roster/upsert',
      headers: { cookie: ccCookie },
      payload: invalidPayload,
    });

    expect(res.statusCode).toBe(400);
  });

  it('4. Rejects CC attempting to upload students for a centre they do not manage (Cross-Centre IDOR)', async () => {
    const crossCentrePayload = {
      students: [
        {
          email: 'injected.student@test.local',
          prn: 'PRN777',
          full_name: 'Injected Student',
          batch_id: batchId,
          centre_id: atcCentreId, // ATC centre, not managed by Mumbai CC
          course_id: pgcpAcCourseId,
        },
      ],
    };

    const res = await app.inject({
      method: 'POST',
      url: '/api/roster/upsert',
      headers: { cookie: ccCookie },
      payload: crossCentrePayload,
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toContain('Unauthorized to add students');
  });

  it('5. Successfully upserts new students for managed cohort and logs CERT-In audit entry', async () => {
    const timestamp = Date.now();
    const testEmail = `new.student.${timestamp}@acts.cdac.in`;
    const testPrn = `PRN_${timestamp}`;
    const validPayload = {
      students: [
        {
          email: testEmail,
          prn: testPrn,
          full_name: 'New Test Candidate',
          batch_id: batchId,
          centre_id: mumbaiCentreId,
          course_id: pgcpAcCourseId,
        },
      ],
    };

    const res = await app.inject({
      method: 'POST',
      url: '/api/roster/upsert',
      headers: { cookie: ccCookie },
      payload: validPayload,
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true, count: 1 });

    // Verify insertion in database
    const dbCheck = await query('SELECT prn, full_name FROM public.student_roster WHERE email = $1', [testEmail]);
    expect(dbCheck.rows.length).toBe(1);
    expect(dbCheck.rows[0].prn).toBe(testPrn);

    // Verify CERT-In Audit Log entry exists
    const auditCheck = await query(
      `SELECT action, entity_type, actor_email, details 
         FROM public.audit_logs 
        WHERE action = 'ROSTER_UPLOAD' AND actor_email = 'cc@test.local'
        ORDER BY logged_at DESC LIMIT 1`
    );
    expect(auditCheck.rows.length).toBe(1);
    expect(auditCheck.rows[0].action).toBe('ROSTER_UPLOAD');
    expect(auditCheck.rows[0].details.count).toBe(1);

    // Clean up
    await query('DELETE FROM public.student_roster WHERE email = $1', [testEmail]);
  });

  it('6. Updates existing student details upon CSV conflict (Idempotent upsert)', async () => {
    const updateEmail = 'student1@test.local';
    const updatePayload = {
      students: [
        {
          email: updateEmail,
          prn: 'PRN001-MODIFIED',
          full_name: 'Alice Student Updated',
          batch_id: batchId,
          centre_id: mumbaiCentreId,
          course_id: pgcpAcCourseId,
        },
      ],
    };

    const res = await app.inject({
      method: 'POST',
      url: '/api/roster/upsert',
      headers: { cookie: ccCookie },
      payload: updatePayload,
    });

    expect(res.statusCode).toBe(200);

    const check = await query('SELECT prn, full_name FROM public.student_roster WHERE email = $1', [updateEmail]);
    expect(check.rows[0].prn).toBe('PRN001-MODIFIED');
    expect(check.rows[0].full_name).toBe('Alice Student Updated');

    // Reset back to original seed to maintain test isolation
    await query(`UPDATE public.student_roster SET prn = 'PRN001', full_name = 'Alice Student' WHERE email = $1`, [
      updateEmail,
    ]);
  });
});
