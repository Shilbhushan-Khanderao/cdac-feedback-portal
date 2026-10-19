import { describe, it, expect, vi, afterEach } from 'vitest';
import { parseConfig } from '../config.js';

const goodProd = {
  NODE_ENV: 'production',
  COOKIE_SECRET: 'x'.repeat(32),
  DATABASE_URL: 'postgresql://feedback_app:pw@db:5432/cdac_feedback',
  DATABASE_ADMIN_URL: 'postgresql://postgres:pw@db:5432/cdac_feedback',
  GOOGLE_CLIENT_ID: 'id',
  GOOGLE_CLIENT_SECRET: 'secret',
  APP_URL: 'https://feedback.example.in',
  CORS_ORIGIN: 'https://feedback.example.in',
};

describe('config fails closed', () => {
  it('accepts a complete production env', () => {
    expect(parseConfig(goodProd).NODE_ENV).toBe('production');
  });

  it('refuses to start without NODE_ENV or DATABASE_URL (no silent dev/localhost defaults)', () => {
    const { NODE_ENV, ...noEnv } = goodProd;
    expect(() => parseConfig(noEnv)).toThrow();
    const { DATABASE_URL, ...noDb } = goodProd;
    expect(() => parseConfig(noDb)).toThrow();
  });

  it.each(['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'APP_URL', 'CORS_ORIGIN', 'COOKIE_SECRET'])(
    'production requires %s',
    (key) => {
      const env: Record<string, string | undefined> = { ...goodProd };
      delete env[key];
      expect(() => parseConfig(env)).toThrow();
    }
  );

  it('rejects a short COOKIE_SECRET and a non-https APP_URL in production', () => {
    expect(() => parseConfig({ ...goodProd, COOKIE_SECRET: 'short' })).toThrow();
    expect(() => parseConfig({ ...goodProd, APP_URL: 'http://feedback.example.in' })).toThrow();
  });
});

describe('dev-login in production', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('is not registered (404) when NODE_ENV=production', async () => {
    for (const [k, v] of Object.entries(goodProd)) vi.stubEnv(k, v);
    vi.resetModules();
    const { buildApp } = await import('../index.js');
    const app = buildApp();
    await app.ready();
    const res = await app.inject({ method: 'POST', url: '/auth/dev-login', payload: { email: 'admin@cdac.in' } });
    expect(res.statusCode).toBe(404);
    // GET logout (CSRF-able) must be gone too.
    expect((await app.inject({ method: 'GET', url: '/auth/logout' })).statusCode).toBe(404);
    await app.close();
    const { pool } = await import('../db/pool.js');
    await pool.end();
  });
});
