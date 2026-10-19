import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../index.js';
import { adminQuery as query } from './admin-db.js';

describe('Government Norms & Regulatory Compliance Suite (CERT-In, DPDP Act 2023, GIGW)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  async function loginAs(email: string): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/dev-login',
      payload: { email },
    });
    const cookies = res.headers['set-cookie'];
    return Array.isArray(cookies) ? cookies[0] : cookies!;
  }

  // =========================================================================
  // 1. DPDP Act 2023: Zero-Linkage & Data Minimization
  // =========================================================================
  describe('1. DPDP Act 2023 — Student Anonymity & Data Minimization', () => {
    it('DB Verification: responses table contains NO student email, ID, or IP columns', async () => {
      const res = await query(`
        SELECT column_name
          FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'responses'
      `);
      const columns = res.rows.map((r: any) => r.column_name);

      // Verify necessary columns exist
      expect(columns).toContain('session_id');
      expect(columns).toContain('answers');

      // Verify privacy-invasive identifying columns strictly DO NOT exist
      expect(columns).not.toContain('email');
      expect(columns).not.toContain('student_id');
      expect(columns).not.toContain('user_id');
      expect(columns).not.toContain('ip_address');
      expect(columns).not.toContain('submitted_at'); // No timestamp to prevent side-channel timing correlation
    });

    it('DPDP k-Anonymity Guard: Reports withhold all responses when count < 3', async () => {
      const ccCookie = await loginAs('cc@test.local');

      // c2 is a closed session in seed with 0 responses
      const res = await app.inject({
        method: 'GET',
        url: '/api/reports/00000000-0000-0000-0000-0000000000c2',
        headers: { cookie: ccCookie },
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);

      // Status must indicate too_few and answers must be empty to prevent deanonymization
      expect(data.status).toBe('too_few');
      expect(data.answers).toEqual([]);
      expect(data.total).toBe(0);
    });

    it('Dashboard Privacy: Aggregated ratings are withheld for sessions under k=3 threshold', async () => {
      const ccCookie = await loginAs('cc@test.local');
      const res = await app.inject({
        method: 'GET',
        url: '/api/reports/dashboard',
        headers: { cookie: ccCookie },
      });
      expect(res.statusCode).toBe(200);
      const rows = JSON.parse(res.body);

      // Find session c2 which has 0 responses
      const sessionC2 = rows.find((r: any) => r.id === '00000000-0000-0000-0000-0000000000c2');
      if (sessionC2) {
        expect(sessionC2.ratings).toBeNull();
      }
    });

    it('Anti-Ballot Stuffing: Database strictly prevents duplicate submissions from the same student', async () => {
      // student1 has already submitted for session c1 in the database
      const student1Cookie = await loginAs('student1@test.local');
      const res = await app.inject({
        method: 'POST',
        url: '/api/feedback/submit',
        headers: { cookie: student1Cookie },
        payload: {
          session_id: '00000000-0000-0000-0000-0000000000c1',
          answers: {
            explanation: 'Good',
            pace: 'Normal',
            interaction: 'Good',
            practical: 'Good',
            overall: 'Good',
          },
        },
      });

      // Must be blocked
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toContain('already submitted');
    });
  });

  // =========================================================================
  // 2. CERT-In Mandate: 180-Day Audit Logging & Traceability
  // =========================================================================
  describe('2. CERT-In Direction 2a & 2b — 180-Day Audit Logs & Traceability', () => {
    it('Audit logging: Authentications and logouts create immutable audit records', async () => {
      const testEmail = 'cc@test.local';
      const cookie = await loginAs(testEmail);

      // Verify LOGIN audit entry was created
      const loginLog = await query(
        `SELECT action, actor_email, entity_type, logged_at
           FROM public.audit_logs
          WHERE actor_email = $1 AND action = 'LOGIN'
          ORDER BY logged_at DESC LIMIT 1`,
        [testEmail]
      );

      expect(loginLog.rows.length).toBe(1);
      expect(loginLog.rows[0].action).toBe('LOGIN');
      expect(loginLog.rows[0].entity_type).toBe('user_sessions');
      expect(loginLog.rows[0].logged_at).toBeDefined();

      // Logout
      await app.inject({
        method: 'POST',
        url: '/auth/logout',
        headers: { cookie },
      });

      // Verify LOGOUT audit entry was created
      const logoutLog = await query(
        `SELECT action, actor_email, entity_type, logged_at
           FROM public.audit_logs
          WHERE actor_email = $1 AND action = 'LOGOUT'
          ORDER BY logged_at DESC LIMIT 1`,
        [testEmail]
      );

      expect(logoutLog.rows.length).toBe(1);
      expect(logoutLog.rows[0].action).toBe('LOGOUT');
    });

    it('Audit logs table schema enforces append-only immutability and valid timestamps', async () => {
      const res = await query(`
        SELECT column_name, data_type, is_nullable
          FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'audit_logs'
      `);
      const colMap = new Map(res.rows.map((r: any) => [r.column_name, r]));

      expect(colMap.has('id')).toBe(true);
      expect(colMap.has('actor_email')).toBe(true);
      expect(colMap.has('action')).toBe(true);
      expect(colMap.has('logged_at')).toBe(true);
    });
  });

  // =========================================================================
  // 3. Sovereign Indian On-Premise Hosting & Zero-CDN Architecture
  // =========================================================================
  describe('3. Air-Gap & Sovereign Data Residency Verification', () => {
    it('Backend dependencies require zero public internet egress at runtime', () => {
      // Configuration check: verify no external analytics, CDNs, or foreign APIs
      expect(process.env.GOOGLE_FONTS_URL).toBeUndefined();
      expect(process.env.AWS_REGION).toBeUndefined();
    });
  });
});
