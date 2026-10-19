import { z } from 'zod';

try {
  process.loadEnvFile();
} catch {
  // .env is optional
}

// Fail closed: NODE_ENV and DATABASE_URL have no defaults, and production additionally
// requires every secret / URL. A missing variable stops the server instead of silently
// running as "development" (which would expose /auth/dev-login).
const BaseSchema = z.object({
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'production', 'test']),
  // Connection as the non-superuser role `feedback_app`.
  DATABASE_URL: z.string().min(1),
  // Owner/superuser; used only by the migrate/seed/bootstrap scripts.
  DATABASE_ADMIN_URL: z.string().min(1).optional(),
  COOKIE_SECRET: z.string().min(32),
  CORS_ORIGIN: z.string().optional(),
  APP_URL: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  SESSION_TTL_HOURS: z.coerce.number().positive().default(24),
  // Optional override of the proxies whose X-Forwarded-For is trusted (comma separated
  // IPs/CIDRs). Default: loopback + private ranges, i.e. the nginx container.
  TRUST_PROXY: z.string().optional(),
});

export function parseConfig(env: NodeJS.ProcessEnv) {
  const c = BaseSchema.parse(env);
  if (c.NODE_ENV === 'production') {
    const missing = (['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'APP_URL', 'CORS_ORIGIN'] as const)
      .filter((k) => !c[k]);
    if (missing.length) throw new Error(`Missing required production env: ${missing.join(', ')}`);
    if (!c.APP_URL!.startsWith('https://')) throw new Error('APP_URL must be https:// in production');
  }
  return {
    ...c,
    CORS_ORIGIN: c.CORS_ORIGIN ?? 'http://localhost:5173',
    APP_URL: c.APP_URL ?? 'http://localhost:5173',
  };
}

export type Config = ReturnType<typeof parseConfig>;

export const config = parseConfig(process.env);
