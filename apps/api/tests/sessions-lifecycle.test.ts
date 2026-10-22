import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { adminQuery as query } from './admin-db.js';

describe('Feedback Sessions Lifecycle & Concurrency Guard Suite', () => {
  let app: FastifyInstance;
  let ccCookie: string;
  let student1Cookie: string;
  let studentAtcCookie: string;

  let mumbaiCentreId: string;
  let pgcpAcCourseId: string;
  let batchId: string;
  let moduleId: string;

  beforeAll(async () => {
    app = buildApp();
    await app.ready();

    // Fetch IDs
    const cRes = await query(`SELECT id FROM public.centres WHERE name = 'C-DAC Mumbai'`);
    mumbaiCentreId = cRes.rows[0]?.id;

    const coRes = await query(`SELECT id FROM public.courses WHERE code = 'PGCP-AC'`);
    pgcpAcCourseId = coRes.rows[0]?.id;

    const bRes = await query(`SELECT id FROM public.batches WHERE label = 'Aug 2026'`);
    batchId = bRes.rows[0]?.id;

    const mRes = await query(`SELECT id FROM public.modules WHERE course_id = $1 LIMIT 1`, [pgcpAcCourseId]);
    moduleId = mRes.rows[0]?.id;

    // Login users
    const ccLogin = await app.inject({
      method: 'POST',
      url: '/auth/dev-login',
      payload: { email: 'cc@test.local' },
    });
    ccCookie = ccLogin.headers['set-cookie'] as string;

    const s1Login = await app.inject({
      method: 'POST',
      url: '/auth/dev-login',
      payload: { email: 'student1@test.local' },
    });
    student1Cookie = s1Login.headers['set-cookie'] as string;

    const sAtcLogin = await app.inject({
      method: 'POST',
      url: '/auth/dev-login',
      payload: { email: 'student3@test.local' },
    });
    studentAtcCookie = sAtcLogin.headers['set-cookie'] as string;
  });

  afterAll(async () => {
    await app.close();
  });

  it('1. Student session list is isolated to their enrolled cohort via in_my_cohort()', async () => {
    const s1Res = await app.inject({
      method: 'GET',
      url: '/api/sessions',
      headers: { cookie: student1Cookie },
    });
    expect(s1Res.statusCode).toBe(200);
    const s1Sessions = JSON.parse(s1Res.body);

    // Student 1 (Mumbai) sees Mumbai session c1, but NOT ATC session c3
    expect(s1Sessions.some((s: any) => s.id === '00000000-0000-0000-0000-0000000000c1')).toBe(true);
    expect(s1Sessions.some((s: any) => s.id === '00000000-0000-0000-0000-0000000000c3')).toBe(false);

    // Student 3 (ATC) sees ATC session c3, but NOT Mumbai session c1
    const sAtcRes = await app.inject({
      method: 'GET',
      url: '/api/sessions',
      headers: { cookie: studentAtcCookie },
    });
    expect(sAtcRes.statusCode).toBe(200);
    const sAtcSessions = JSON.parse(sAtcRes.body);
    expect(sAtcSessions.some((s: any) => s.id === '00000000-0000-0000-0000-0000000000c3')).toBe(true);
    expect(sAtcSessions.some((s: any) => s.id === '00000000-0000-0000-0000-0000000000c1')).toBe(false);
  });

  it('2. Coordinator can schedule a new session and batch sessions', async () => {
    const opensAt = new Date(Date.now() - 3600000).toISOString();
    const closesAt = new Date(Date.now() + 86400000).toISOString();

    const newSessionPayload = {
      batch_id: batchId,
      centre_id: mumbaiCentreId,
      course_id: pgcpAcCourseId,
      module_id: moduleId,
      faculty: ['Dr. Lifecycle Test'],
      opens_at: opensAt,
      closes_at: closesAt,
    };

    const res = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      headers: { cookie: ccCookie },
      payload: newSessionPayload,
    });

    expect(res.statusCode).toBe(201);
    const created = JSON.parse(res.body);
    expect(created.id).toBeDefined();
    expect(created.faculty).toContain('Dr. Lifecycle Test');

    // 3. Coordinator can update faculty for the session
    const patchFaculty = await app.inject({
      method: 'PATCH',
      url: `/api/sessions/${created.id}/faculty`,
      headers: { cookie: ccCookie },
      payload: { faculty: ['Dr. Lifecycle Test', 'Prof. Guest Co-Faculty'] },
    });
    expect(patchFaculty.statusCode).toBe(200);
    const updatedFaculty = JSON.parse(patchFaculty.body);
    expect(updatedFaculty.faculty.length).toBe(2);

    // 4. Coordinator can reschedule the session
    const newClosesAt = new Date(Date.now() + 172800000).toISOString();
    const reschedule = await app.inject({
      method: 'PATCH',
      url: `/api/sessions/${created.id}/schedule`,
      headers: { cookie: ccCookie },
      payload: { closes_at: newClosesAt },
    });
    expect(reschedule.statusCode).toBe(200);

    // 5. Deletion of an empty session succeeds
    const deleteRes = await app.inject({
      method: 'DELETE',
      url: `/api/sessions/${created.id}`,
      headers: { cookie: ccCookie },
    });
    expect(deleteRes.statusCode).toBe(200);
    expect(JSON.parse(deleteRes.body).ok).toBe(true);
  });

  it('3. Anti-Data-Loss: Cannot delete a session that already has student submissions', async () => {
    // Session c1 has submissions in the seed
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/sessions/00000000-0000-0000-0000-0000000000c1',
      headers: { cookie: ccCookie },
    });

    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).error).toContain('Cannot delete session that already has submissions');
  });

  it('4. Anti-Ballot-Stuffing Concurrency Test: Race condition defense under parallel submissions', async () => {
    // Create a fresh session for concurrency testing
    const opensAt = new Date(Date.now() - 3600000).toISOString();
    const closesAt = new Date(Date.now() + 86400000).toISOString();

    const sessionRes = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      headers: { cookie: ccCookie },
      payload: {
        batch_id: batchId,
        centre_id: mumbaiCentreId,
        course_id: pgcpAcCourseId,
        module_id: moduleId,
        faculty: ['Concurrency Tester'],
        opens_at: opensAt,
        closes_at: closesAt,
      },
    });
    const testSession = JSON.parse(sessionRes.body);

    // Fire 5 identical parallel feedback submissions for the same student simultaneously
    const payload = {
      session_id: testSession.id,
      answers: {
        overall: 'Excellent',
        explanation: 'Very Good',
        pace: 'Normal',
        interaction: 'Good',
        practical: 'Excellent',
        lab_comments: 'Race condition test comment',
      },
    };

    const parallelRequests = Array.from({ length: 5 }, () =>
      app.inject({
        method: 'POST',
        url: '/api/feedback/submit',
        headers: { cookie: student1Cookie },
        payload,
      })
    );

    const responses = await Promise.all(parallelRequests);
    const successCount = responses.filter((r) => r.statusCode === 200).length;
    const rejectedCount = responses.filter((r) => r.statusCode === 400).length;

    // Exactly 1 submission must succeed, and exactly 4 must be blocked
    expect(successCount).toBe(1);
    expect(rejectedCount).toBe(4);

    // Verify database state: exactly 1 response and 1 submission recorded
    const subRows = await query('SELECT count(*)::int AS count FROM public.submissions WHERE session_id = $1', [
      testSession.id,
    ]);
    const respRows = await query('SELECT count(*)::int AS count FROM public.responses WHERE session_id = $1', [
      testSession.id,
    ]);

    expect(subRows.rows[0].count).toBe(1);
    expect(respRows.rows[0].count).toBe(1);

    // Clean up test data
    await query('DELETE FROM public.responses WHERE session_id = $1', [testSession.id]);
    await query('DELETE FROM public.submissions WHERE session_id = $1', [testSession.id]);
    await query('DELETE FROM public.feedback_sessions WHERE id = $1', [testSession.id]);
  });
});
