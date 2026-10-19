import { z } from 'zod';

try {
  process.loadEnvFile();
} catch {
  // .env is optional
}

const ConfigSchema = z.object({
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().default('postgresql://postgres:postgres@localhost:5432/cdac_feedback'),
  // S2: No default — the server will refuse to start if COOKIE_SECRET is not set.
  // Copy .env.example to .env and fill in a strong random value (openssl rand -hex 32).
  COOKIE_SECRET: z.string().min(32),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  APP_URL: z.string().default('http://localhost:5173'),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  SESSION_TTL_HOURS: z.coerce.number().default(24),
});

export type Config = z.infer<typeof ConfigSchema>;

export const config = ConfigSchema.parse(process.env);
