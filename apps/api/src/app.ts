import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { config } from './config.js';
import { pool } from './db/pool.js';
import { authRoutes } from './modules/auth/routes.js';
import { referenceRoutes } from './modules/reference/routes.js';
import { sessionRoutes } from './modules/sessions/routes.js';
import { feedbackRoutes } from './modules/feedback/routes.js';
import { reportRoutes } from './modules/reports/routes.js';
import { rosterRoutes } from './modules/roster/routes.js';
import { tablesRoutes } from './modules/tables/routes.js';
import { consentRoutes } from './modules/consent/routes.js';
import { AppError } from './shared/errors.js';
import { audit } from './shared/audit.js';

const SESSION_COOKIE = 'cdac_session';

export function buildApp() {
  const app = Fastify({
    logger: {
      level: config.NODE_ENV === 'production' ? 'info' : 'debug',
      // Redact sensitive headers and bodies
      redact: ['req.headers.authorization', 'req.headers.cookie'],
      // ISO-8601 UTC instead of epoch ms, so log reviewers can read times directly.
      timestamp: () => `,"time":"${new Date().toISOString()}"`,
      serializers: {
        // INF-4: the OAuth callback's query string (?code=...&state=...) must never land in
        // logs verbatim. The code is single-use/short-lived/PKCE-bound, but a log line is
        // forever and the raw request line was showing up unredacted. Same shape Fastify's
        // own default req serializer uses, just with the query string stripped for this one
        // path; every other route logs exactly as before.
        req(req) {
          const url = req.url && req.url.startsWith('/auth/google/callback') ? req.url.split('?')[0] : req.url;
          return {
            method: req.method,
            url,
            host: req.host,
            remoteAddress: req.ip,
            remotePort: req.socket ? req.socket.remotePort : undefined,
          };
        },
      },
    },
    // Trust X-Forwarded-For only from the nginx hop (loopback / private docker network),
    // never from arbitrary peers. nginx sets XFF to $remote_addr, so req.ip is the real client.
    trustProxy: config.TRUST_PROXY
      ? config.TRUST_PROXY.split(',').map((s) => s.trim()).filter(Boolean)
      : ['loopback', 'uniquelocal'],
    // 50 KB default; the roster upload route raises its own limit.
    bodyLimit: 51200,
  });

  // ---------------------------------------------------------------- Error Handler
  // Never echo raw error messages for 5xx or unknown errors; routes map DB errors via mapDbError().
  app.setErrorHandler((err, req, reply) => {
    req.log.warn({ err }, 'Request failed with error');
    if (err instanceof AppError) {
      // CMP-6: authz failures are audited once, here, instead of at every forbidden() call
      // site in sessions/tables/roster (the only routes that throw one). Fire-and-forget so a
      // logging hiccup never delays or masks the error response itself.
      if (err.statusCode === 403) {
        void audit({
          actor: req.user?.email ?? null,
          action: 'AUTHZ_DENIED',
          entityType: 'http',
          details: { method: req.method, url: req.url.split('?')[0], message: err.message },
          ip: req.ip,
        }).catch(() => {});
      }
      return reply.status(err.statusCode).send({ error: err.message, code: err.code });
    }
    const statusCode = (err as any).statusCode || (err as any).status || 500;
    if (statusCode >= 500) {
      return reply.status(statusCode).send({ error: 'Internal Server Error' });
    }
    // Fastify's own 4xx (malformed JSON, payload too large, ...) have safe messages.
    return reply.status(statusCode).send({ error: (err as any).message || 'Request failed' });
  });

  // ---------------------------------------------------------------- Security Headers
  app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        fontSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    hsts: {
      maxAge: 63072000,
      includeSubDomains: true,
      preload: true,
    },
    frameguard: { action: 'deny' },
    noSniff: true,
  });

  // ---------------------------------------------------------------- Signed Cookies
  app.register(cookie, {
    secret: config.COOKIE_SECRET,
    hook: 'onRequest',
  });

  // ---------------------------------------------------------------- CORS
  const originAllowed = (origin: string) =>
    origin === config.CORS_ORIGIN || (config.NODE_ENV !== 'production' && origin.startsWith('http://localhost:'));

  app.register(cors, {
    origin: (origin, cb) => {
      // No Origin (server-to-server, health probes) is fine; otherwise must match.
      if (!origin || originAllowed(origin)) {
        cb(null, true);
        return;
      }
      const err = new Error('Cross-origin request blocked') as Error & { statusCode: number };
      err.statusCode = 403;
      cb(err, false);
    },
    credentials: true,
  });

  // CSRF defence in depth (on top of SameSite=Lax): state-changing requests that carry an
  // Origin header must come from the configured frontend.
  app.addHook('onRequest', async (req, reply) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      const origin = req.headers.origin;
      if (origin && !originAllowed(origin)) {
        return reply.status(403).send({ error: 'Cross-origin request blocked' });
      }
    }
  });

  // ---------------------------------------------------------------- Rate Limiting (DoS Defense)
  // /api buckets per signed session cookie (a campus NAT shares one IP across hundreds of
  // students); anything without a validly signed cookie falls back to the client IP.
  // Forged cookies cannot mint new buckets because the signature is verified first.
  // /auth gets its own per-IP bucket with a bigger burst for login rushes.
  const isAuth = (url: string) => url.startsWith('/auth');
  app.register(rateLimit, {
    allowList: (req) => req.url === '/healthz',
    keyGenerator: (req) => {
      if (isAuth(req.url)) return `auth:${req.ip}`;
      const raw = req.cookies?.[SESSION_COOKIE];
      const un = raw ? req.unsignCookie(raw) : null;
      return un?.valid && un.value ? `s:${un.value.slice(0, 16)}` : `ip:${req.ip}`;
    },
    max: (_req, key) => (key.startsWith('auth:') ? 1500 : key.startsWith('s:') ? 240 : 1500),
    timeWindow: '1 minute',
  });

  // ---------------------------------------------------------------- Health Check
  app.get('/healthz', { logLevel: 'warn' }, async () => ({ status: 'ok', uptime: process.uptime() }));

  // Polled every 15s by the container healthcheck: log only failures.
  app.get('/api/health', { logLevel: 'warn' }, async (_req, reply) => {
    try {
      await pool.query('SELECT 1');
      return { status: 'healthy', database: 'connected' };
    } catch {
      return reply.status(503).send({ status: 'unhealthy', database: 'disconnected' });
    }
  });

  // ---------------------------------------------------------------- Route Registrations
  app.register(authRoutes, { prefix: '/auth' });
  app.register(referenceRoutes, { prefix: '/api/reference' });
  app.register(tablesRoutes, { prefix: '/api/reference/tables' });
  app.register(sessionRoutes, { prefix: '/api/sessions' });
  app.register(feedbackRoutes, { prefix: '/api/feedback' });
  app.register(reportRoutes, { prefix: '/api/reports' });
  app.register(rosterRoutes, { prefix: '/api/roster' });
  app.register(consentRoutes, { prefix: '/api/consent' });

  return app;
}
