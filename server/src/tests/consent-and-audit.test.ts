import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../index.js';
import { adminQuery as query } from './admin-db.js';

describe('Consent (CMP-4) & audit coverage (CMP-6) Integration Tests', () => {
  let app: FastifyInstance;
  let studentCookie: string;
  let ccCookie: string;

  beforeAll(async () => {
    app = buildApp();
    await app.ready();

    const studentLogin = await app.inject({
      method: 'POST',
      url: '/auth/dev-login',
      payload: { email: 'student1@test.local' },
    });
    studentCookie = studentLogin.headers['set-cookie'] as string;

    const ccLogin = await app.inject({
      method: 'POST',
      url: '/auth/dev-login',
      payload: { email: 'cc@test.local' },
    });
    ccCookie = ccLogin.headers['set-cookie'] as string;
  });

  afterAll(async () => {
    await query(`DELETE FROM public.consent_records WHERE email = 'student1@test.local'`);
    await app.close();
  });

  it('1. POST /api/consent inserts a record, then upserts (conflict) on re-accept', async () => {
    const first = await app.inject({
      method: 'POST',
      url: '/api/consent',
      headers: { cookie: studentCookie },
    });
    expect(first.statusCode).toBe(200);
    expect(JSON.parse(first.body)).toEqual({ ok: true });

    const afterFirst = await query(
      `SELECT email, version, accepted_at FROM public.consent_records WHERE email = 'student1@test.local'`
    );
    expect(afterFirst.rows.length).toBe(1);
    expect(afterFirst.rows[0].version).toBe('v1');
    const firstAcceptedAt = afterFirst.rows[0].accepted_at as Date;

    // Re-accept (e.g. the same click fired twice, or re-visiting the notice): same (email,
    // version) must upsert in place, not create a second row or error.
    await new Promise((r) => setTimeout(r, 10));
    const second = await app.inject({
      method: 'POST',
      url: '/api/consent',
      headers: { cookie: studentCookie },
    });
    expect(second.statusCode).toBe(200);

    const afterSecond = await query(
      `SELECT email, version, accepted_at FROM public.consent_records WHERE email = 'student1@test.local'`
    );
    expect(afterSecond.rows.length).toBe(1);
    expect(new Date(afterSecond.rows[0].accepted_at).getTime()).toBeGreaterThan(new Date(firstAcceptedAt).getTime());
  });

  it('2. POST /api/consent requires authentication', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/consent' });
    expect(res.statusCode).toBe(401);
  });

  it('3. A 403 authorization failure writes an AUTHZ_DENIED audit row', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/reference/tables/courses',
      headers: { cookie: ccCookie },
      payload: { code: 'AUDIT-TEST', name: 'Should be forbidden' },
    });
    expect(res.statusCode).toBe(403);

    const rows = await query(
      `SELECT actor_email, details FROM public.audit_logs
        WHERE action = 'AUTHZ_DENIED' ORDER BY id DESC LIMIT 1`
    );
    expect(rows.rows.length).toBe(1);
    expect(rows.rows[0].actor_email).toBe('cc@test.local');
    expect(rows.rows[0].details.url).toBe('/api/reference/tables/courses');
    expect(rows.rows[0].details.message).toContain('Admin access required');
  });

  it('4. A bulk PII list read (student_roster) writes a light BULK_READ audit row', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/reference/tables/student_roster',
      headers: { cookie: ccCookie },
    });
    expect(res.statusCode).toBe(200);

    const rows = await query(
      `SELECT actor_email, entity_type, details FROM public.audit_logs
        WHERE action = 'BULK_READ' ORDER BY id DESC LIMIT 1`
    );
    expect(rows.rows.length).toBe(1);
    expect(rows.rows[0].actor_email).toBe('cc@test.local');
    expect(rows.rows[0].entity_type).toBe('student_roster');
    expect(typeof rows.rows[0].details.count).toBe('number');
  });

  it("5. Reading a non-PII reference table (batches) does NOT write an audit row", async () => {
    const before = await query(`SELECT count(*)::int AS n FROM public.audit_logs WHERE entity_type = 'batches'`);
    const res = await app.inject({
      method: 'GET',
      url: '/api/reference/tables/batches',
      headers: { cookie: ccCookie },
    });
    expect(res.statusCode).toBe(200);
    const after = await query(`SELECT count(*)::int AS n FROM public.audit_logs WHERE entity_type = 'batches'`);
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });
});
