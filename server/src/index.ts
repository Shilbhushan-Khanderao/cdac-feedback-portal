import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { config } from './config.js';
import { pool } from './db/pool.js';
import { authRoutes } from './auth/routes.js';
import { referenceRoutes } from './routes/reference.js';
import { sessionRoutes } from './routes/sessions.js';
import { feedbackRoutes } from './routes/feedback.js';
import { reportRoutes } from './routes/reports.js';
import { rosterRoutes } from './routes/roster.js';

export function buildApp() {
  const app = Fastify({
    logger: {
      level: config.NODE_ENV === 'production' ? 'info' : 'debug',
      // Redact sensitive headers and bodies
      redact: ['req.headers.authorization', 'req.headers.cookie'],
    },
    trustProxy: true,
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
  app.register(cors, {
    origin: (origin, cb) => {
      // Allow requests with no origin (mobile apps, curl) or matching configured frontend
      if (!origin || origin === config.CORS_ORIGIN || origin.startsWith('http://localhost:')) {
        cb(null, true);
        return;
      }
      cb(new Error('CORS disallowed'), false);
    },
    credentials: true,
  });

  // ---------------------------------------------------------------- Rate Limiting (DoS Defense)
  app.register(rateLimit, {
    max: 120,
    timeWindow: '1 minute',
  });

  // ---------------------------------------------------------------- Health Check
  app.get('/healthz', async () => ({ status: 'ok', uptime: process.uptime() }));

  app.get('/api/health', async () => {
    try {
      await pool.query('SELECT 1');
      return { status: 'healthy', database: 'connected' };
    } catch {
      return { status: 'unhealthy', database: 'disconnected' };
    }
  });

  // ---------------------------------------------------------------- Route Registrations
  app.register(authRoutes, { prefix: '/auth' });
  app.register(referenceRoutes, { prefix: '/api/reference' });
  app.register(sessionRoutes, { prefix: '/api/sessions' });
  app.register(feedbackRoutes, { prefix: '/api/feedback' });
  app.register(reportRoutes, { prefix: '/api/reports' });
  app.register(rosterRoutes, { prefix: '/api/roster' });

  return app;
}

async function start() {
  const app = buildApp();
  try {
    await app.listen({ port: config.PORT, host: config.HOST });
    app.log.info(`[server] C-DAC Feedback Portal API running on http://${config.HOST}:${config.PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

if (process.argv[1] && process.argv[1].endsWith('index.ts') || process.argv[1]?.endsWith('index.js')) {
  void start();
}
