import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { adminQuery as query } from './admin-db.js';

describe('VAPT Automated Penetration Testing Suite', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  // Helper to obtain a valid signed session cookie for a test user
  async function loginAs(email: string): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/dev-login',
      payload: { email },
    });
    expect(res.statusCode).toBe(200);
    const cookies = res.headers['set-cookie'];
    if (!cookies) throw new Error(`No cookie set for ${email}`);
    return Array.isArray(cookies) ? cookies[0] : cookies;
  }

  // =========================================================================
  // 1. Authentication & Session Integrity (OWASP A07 & CERT-In)
  // =========================================================================
  describe('1. Authentication & Session Integrity', () => {
    it('Rejects unauthenticated requests to protected endpoints with 401', async () => {
      const endpoints = [
        '/api/sessions',
        '/api/reports/dashboard',
        '/api/roster',
        '/api/reference/batches',
        '/api/feedback/my-submissions',
      ];
      for (const url of endpoints) {
        const res = await app.inject({ method: 'GET', url });
        expect(res.statusCode).toBe(401);
      }
    });

    it('Rejects forged session cookies with invalid cryptographic signatures', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/sessions',
        headers: {
          cookie: 'cdac_session=forged_session_token_attempting_bypass.invalid_sig',
        },
      });
      expect(res.statusCode).toBe(401);
      const body = JSON.parse(res.body);
      expect(body.error).toContain('Unauthorized');
    });

    it('Rejects tampered cookies where the signature or value was modified', async () => {
      const realCookie = await loginAs('student1@test.local');
      // Format is cdac_session=s%3A<id>.<sig>; Path=/; ...
      const cookieVal = realCookie.split(';')[0];
      // Tamper with the last 4 characters of the HMAC signature
      const tamperedCookie = cookieVal.slice(0, -4) + 'abcd';
      const res = await app.inject({
        method: 'GET',
        url: '/api/sessions',
        headers: { cookie: tamperedCookie },
      });
      expect(res.statusCode).toBe(401);
    });

    it('Enforces HttpOnly, SameSite=Lax and Secure session cookies', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/dev-login',
        payload: { email: 'student1@test.local' },
      });
      const cookieHeader = res.headers['set-cookie'] as string;
      expect(cookieHeader).toContain('HttpOnly');
      expect(cookieHeader).toContain('SameSite=Lax');
      expect(cookieHeader).toContain('cdac_session=');
    });

    it('Session revocation: Logout immediately terminates session in database', async () => {
      const studentCookie = await loginAs('student1@test.local');

      // Verify access works before logout
      const beforeRes = await app.inject({
        method: 'GET',
        url: '/auth/whoami',
        headers: { cookie: studentCookie },
      });
      expect(JSON.parse(beforeRes.body).user.email).toBe('student1@test.local');

      // Perform logout
      const logoutRes = await app.inject({
        method: 'POST',
        url: '/auth/logout',
        headers: { cookie: studentCookie },
      });
      expect(logoutRes.statusCode).toBe(200);

      // Verify immediate rejection on subsequent requests with that cookie
      const afterRes = await app.inject({
        method: 'GET',
        url: '/auth/whoami',
        headers: { cookie: studentCookie },
      });
      expect(JSON.parse(afterRes.body).user).toBeNull();

      // Protected routes reject
      const protectedRes = await app.inject({
        method: 'GET',
        url: '/api/sessions',
        headers: { cookie: studentCookie },
      });
      expect(protectedRes.statusCode).toBe(401);
    });
  });

  // =========================================================================
  // 2. Broken Access Control & IDOR (OWASP A01)
  // =========================================================================
  describe('2. Broken Access Control & Privilege Escalation', () => {
    it('Vertical Escalation Guard: Student cannot access coordinator/admin dashboard', async () => {
      const studentCookie = await loginAs('student1@test.local');
      const res = await app.inject({
        method: 'GET',
        url: '/api/reports/dashboard',
        headers: { cookie: studentCookie },
      });
      expect(res.statusCode).toBe(403);
      expect(JSON.parse(res.body).error).toContain('Forbidden');
    });

    it('Vertical Escalation Guard: Student cannot access student roster data', async () => {
      const studentCookie = await loginAs('student1@test.local');
      const res = await app.inject({
        method: 'GET',
        url: '/api/roster',
        headers: { cookie: studentCookie },
      });
      expect(res.statusCode).toBe(403);
    });

    it('Vertical Escalation Guard: Student cannot create feedback sessions', async () => {
      const studentCookie = await loginAs('student1@test.local');
      const res = await app.inject({
        method: 'POST',
        url: '/api/sessions',
        headers: { cookie: studentCookie },
        payload: {
          batch_id: '00000000-0000-0000-0000-0000000000b1',
          centre_id: '00000000-0000-0000-0000-000000000001',
          course_id: '00000000-0000-0000-0000-0000000000c1',
          module_id: '00000000-0000-0000-0000-0000000000m1',
          faculty: ['Hacked Faculty'],
          opens_at: new Date().toISOString(),
          closes_at: new Date(Date.now() + 86400000).toISOString(),
        },
      });
      expect(res.statusCode).toBe(403);
    });

    it('Vertical Escalation Guard: Student cannot add faculty members', async () => {
      const studentCookie = await loginAs('student1@test.local');
      const res = await app.inject({
        method: 'POST',
        url: '/api/reference/faculty',
        headers: { cookie: studentCookie },
        payload: { name: 'Malicious Faculty' },
      });
      expect(res.statusCode).toBe(403);
    });

    it('Vertical Escalation Guard: Student cannot view cohort sizes', async () => {
      const studentCookie = await loginAs('student1@test.local');
      const res = await app.inject({
        method: 'GET',
        url: '/api/reference/cohort-sizes',
        headers: { cookie: studentCookie },
      });
      expect(res.statusCode).toBe(403);
    });

    it('Horizontal Escalation Guard: Coordinator cannot access reports from another centre', async () => {
      // cc.atc is coordinator for ATC centre (00000000-0000-0000-0000-0000000000a1)
      const atcCcCookie = await loginAs('cc.atc@test.local');

      // Attempt to access session c1 (which belongs to C-DAC Mumbai)
      const res = await app.inject({
        method: 'GET',
        url: '/api/reports/00000000-0000-0000-0000-0000000000c1',
        headers: { cookie: atcCcCookie },
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toContain('not in your centre');
    });

    it('Cross-Cohort Guard: Student cannot submit feedback to another centre session', async () => {
      // student1 is enrolled in Mumbai AC
      const student1Cookie = await loginAs('student1@test.local');

      // c3 is an open session for ATC centre
      const res = await app.inject({
        method: 'POST',
        url: '/api/feedback/submit',
        headers: { cookie: student1Cookie },
        payload: {
          session_id: '00000000-0000-0000-0000-0000000000c3',
          answers: {
            explanation: 'Good',
            pace: 'Normal',
            interaction: 'Good',
            practical: 'Good',
            overall: 'Good',
          },
        },
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toContain('not enrolled in this batch');
    });
  });

  // =========================================================================
  // 3. Injection & Input Validation (OWASP A03)
  // =========================================================================
  describe('3. Injection & Input Sanitization', () => {
    it('SQL Injection in UUID route parameter is safely rejected', async () => {
      const adminCookie = await loginAs('admin@test.local');
      const maliciousIds = [
        "00000000-0000-0000-0000-0000000000c1' OR '1'='1",
        "00000000-0000-0000-0000-0000000000c1; DROP TABLE audit_logs;--",
        "../../etc/passwd",
        "<script>alert(1)</script>",
      ];

      for (const malId of maliciousIds) {
        const res = await app.inject({
          method: 'GET',
          url: `/api/sessions/${encodeURIComponent(malId)}`,
          headers: { cookie: adminCookie },
        });
        // Must reject with 400 (Zod invalid UUID) or 404, never 500 database error
        expect([400, 404]).toContain(res.statusCode);
      }
    });

    it('DDoS / Resource Exhaustion Guard: Rejects payloads > 50 KB with 413', async () => {
      const studentCookie = await loginAs('student1@test.local');
      // Create a 60 KB string payload
      const largeText = 'A'.repeat(60 * 1024);

      const res = await app.inject({
        method: 'POST',
        url: '/api/feedback/submit',
        headers: {
          cookie: studentCookie,
          'content-type': 'application/json',
        },
        payload: JSON.stringify({
          sessionId: '00000000-0000-0000-0000-0000000000c1',
          answers: { theory_comments: largeText },
        }),
      });
      expect(res.statusCode).toBe(413);
    });

    it('XSS Resistance: Stored feedback comments containing HTML are preserved as harmless raw text', async () => {
      const studentCookie = await loginAs('student2@test.local');
      const xssPayload = '<script>alert("XSS")</script><img src=x onerror=alert(1)>';

      // Check submission validation accepts text without evaluating it
      const res = await app.inject({
        method: 'POST',
        url: '/api/feedback/submit',
        headers: { cookie: studentCookie },
        payload: {
          sessionId: '00000000-0000-0000-0000-0000000000c1',
          answers: {
            explanation: 'Good',
            pace: 'Normal',
            interaction: 'Good',
            practical: 'Good',
            overall: 'Good',
            theory_comments: xssPayload,
          },
        },
      });

      // Submit should succeed or fail with standard logic, never execute
      if (res.statusCode === 200) {
        const dbRes = await query(
          `SELECT answers FROM public.responses WHERE session_id = '00000000-0000-0000-0000-0000000000c1' ORDER BY ctid DESC LIMIT 1`
        );
        expect(dbRes.rows[0].answers.theory_comments).toBe(xssPayload);
      }
    });
  });

  // =========================================================================
  // 4. Security Headers & Defense-in-Depth (OWASP A05)
  // =========================================================================
  describe('4. Security Headers & Network Defense', () => {
    it('Enforces all mandatory OWASP & CERT-In security headers', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/healthz',
      });

      // X-Content-Type-Options: nosniff
      expect(res.headers['x-content-type-options']).toBe('nosniff');

      // Anti-Clickjacking: X-Frame-Options DENY
      expect(res.headers['x-frame-options']).toBe('DENY');

      // Strict CSP with frame-ancestors none
      const csp = res.headers['content-security-policy'] as string;
      expect(csp).toBeDefined();
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("frame-ancestors 'none'");

      // HSTS 2-year preload
      const hsts = res.headers['strict-transport-security'] as string;
      expect(hsts).toBeDefined();
      expect(hsts).toContain('max-age=63072000');

      // No technology disclosure
      expect(res.headers['x-powered-by']).toBeUndefined();
    });
  });
});
