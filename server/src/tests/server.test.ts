import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../index.js';

describe('Fastify Security & API Server Tests', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /healthz returns ok with uptime', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/healthz',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('ok');
    expect(typeof body.uptime).toBe('number');
  });

  it('Sets strict security headers (OWASP / CERT-In compliance)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/healthz',
    });

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['content-security-policy']).toBeDefined();
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(res.headers['strict-transport-security']).toBeDefined();
  });

  it('GET /auth/whoami returns user: null when unauthenticated', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/auth/whoami',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.user).toBeNull();
  });

  it('Protected routes reject unauthenticated requests with 401', async () => {
    const endpoints = [
      { method: 'GET', url: '/api/sessions' },
      { method: 'GET', url: '/api/reports/dashboard' },
      { method: 'GET', url: '/api/roster' },
      { method: 'GET', url: '/api/reference/batches' },
    ];

    for (const ep of endpoints) {
      const res = await app.inject({
        method: ep.method as any,
        url: ep.url,
      });
      expect(res.statusCode).toBe(401);
      const body = JSON.parse(res.body);
      expect(body.error).toContain('Unauthorized');
    }
  });

  it('POST /auth/dev-login rejects invalid email formats with 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/dev-login',
      payload: { email: 'not-an-email' },
    });

    expect(res.statusCode).toBe(400);
  });
});
