import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { adminQuery as query } from './admin-db.js';

// dashboard_insights() (006) must follow session_report()'s gate: closed, in scope, n >= 3, and
// return only per-option counts and comment strings, never anything per student or per response.
describe('GET /api/reports/dashboard/insights', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  async function get(email: string) {
    const login = await app.inject({ method: 'POST', url: '/auth/dev-login', payload: { email } });
    const cookie = [login.headers['set-cookie']].flat()[0]!;
    return app.inject({
      method: 'GET',
      url: '/api/reports/dashboard/insights',
      headers: { cookie },
    });
  }

  it('returns only closed sessions with at least 3 responses, as counts and comments', async () => {
    const res = await get('admin@test.local');
    expect(res.statusCode).toBe(200);
    const rows = JSON.parse(res.body) as {
      session_id: string;
      counts: Record<string, Record<string, number>>;
      comments: Record<string, string[]>;
    }[];
    expect(rows.length).toBeGreaterThan(0);

    const eligible = await query(
      `SELECT s.id FROM feedback_sessions s
        WHERE s.closes_at < now() AND (SELECT count(*) FROM responses r WHERE r.session_id = s.id) >= 3`,
    );
    expect(new Set(rows.map((r) => r.session_id))).toEqual(new Set(eligible.rows.map((r) => r.id)));

    for (const r of rows) {
      expect(Object.keys(r).sort()).toEqual(['comments', 'counts', 'questions', 'session_id']);
      for (const opts of Object.values(r.counts))
        for (const n of Object.values(opts)) expect(typeof n).toBe('number');
      for (const list of Object.values(r.comments))
        for (const c of list) expect(typeof c).toBe('string');
    }
    // No student identity anywhere in the payload.
    expect(res.body).not.toMatch(/@test\.local|submitted_at|student_email/);
  });

  it('a coordinator only gets sessions they can manage', async () => {
    const rows = JSON.parse((await get('cc.atc@test.local')).body) as { session_id: string }[];
    const outside = await query(
      `SELECT count(*)::int AS n FROM feedback_sessions s
         JOIN staff_roster st ON st.email = 'cc.atc@test.local'
        WHERE s.id = ANY($1::uuid[]) AND s.centre_id IS DISTINCT FROM st.centre_id`,
      [rows.map((r) => r.session_id)],
    );
    expect(outside.rows[0].n).toBe(0);
  });

  it('students are refused, and each staff read is audited', async () => {
    expect((await get('student1@test.local')).statusCode).toBe(403);
    const count = async () =>
      (
        await query(
          `SELECT count(*)::int AS n FROM audit_logs WHERE action = 'DASHBOARD_INSIGHTS_VIEW'`,
        )
      ).rows[0].n;
    const before = await count();
    await get('admin@test.local');
    expect(await count()).toBe(before + 1);
  });
});
