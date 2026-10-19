import crypto from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { config } from '../config.js';
import { withUser } from '../db/pool.js';
import { audit } from '../lib/audit.js';
import { createSession, destroySession, getSession, lookupRole } from './session.js';

const COOKIE_NAME = 'cdac_session';
const OAUTH_COOKIE = 'cdac_oauth';

const sessionCookie = {
  path: '/',
  httpOnly: true,
  secure: config.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  signed: true,
  maxAge: config.SESSION_TTL_HOURS * 3600,
};
const b64url = (b: Buffer) => b.toString('base64url');
const fail = (msg: string) => `${config.APP_URL}?error_description=${encodeURIComponent(msg)}`;

export const authRoutes: FastifyPluginAsync = async (app) => {
  // ---------------------------------------------------------------- Current User
  app.get('/whoami', async (req, reply) => {
    const rawCookie = req.cookies[COOKIE_NAME];
    if (!rawCookie) {
      return reply.send({ user: null });
    }

    const unsigned = req.unsignCookie(rawCookie);
    if (!unsigned.valid || !unsigned.value) {
      return reply.send({ user: null });
    }

    const session = await getSession(unsigned.value);
    if (!session) {
      reply.clearCookie(COOKIE_NAME, { path: '/' });
      return reply.send({ user: null });
    }

    const userData = await withUser(session.email, async (client) => {
      const res = await client.query('SELECT whoami() AS me');
      return res.rows[0]?.me ?? null;
    });

    return reply.send({ user: userData });
  });

  // ---------------------------------------------------------------- Logout (POST only: GET logout is CSRF-able)
  app.post('/logout', async (req, reply) => {
    const rawCookie = req.cookies[COOKIE_NAME];
    if (rawCookie) {
      const unsigned = req.unsignCookie(rawCookie);
      if (unsigned.valid && unsigned.value) {
        await destroySession(unsigned.value, req.ip);
      }
    }
    reply.clearCookie(COOKIE_NAME, { path: '/' });
    return reply.send({ ok: true });
  });

  // ---------------------------------------------------------------- Dev Login (not registered in production => 404)
  if (config.NODE_ENV !== 'production') {
    const DevLoginSchema = z.object({
      email: z.string().email(),
    });

    app.post('/dev-login', async (req, reply) => {
      const parsed = DevLoginSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Invalid email address' });
      }

      const email = parsed.data.email.toLowerCase().trim();
      const role = await lookupRole(email);
      if (!role) {
        await audit({ actor: email, action: 'LOGIN_FAILED', entityType: 'user_sessions', details: { reason: 'not_on_roster', via: 'dev' }, ip: req.ip });
        return reply.status(403).send({
          error: 'This account is not on the feedback roster. Ask your course coordinator to add your email.',
        });
      }

      const token = await createSession(email, role, req.ip, req.headers['user-agent']);
      reply.setCookie(COOKIE_NAME, token, sessionCookie);

      const user = await withUser(email, async (client) => {
        const res = await client.query('SELECT whoami() AS me');
        return res.rows[0]?.me;
      });

      return reply.send({ ok: true, user });
    });
  }

  // ---------------------------------------------------------------- Google OAuth2 Initiation (state + PKCE)
  app.get('/google', async (_req, reply) => {
    if (!config.GOOGLE_CLIENT_ID) {
      return reply.status(501).send({ error: 'Google OAuth not configured in this environment.' });
    }

    const state = b64url(crypto.randomBytes(24));
    const verifier = b64url(crypto.randomBytes(32));
    const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());

    // Bind state + verifier to this browser. Lax is enough: Google redirects back via top-level GET.
    reply.setCookie(OAUTH_COOKIE, `${state}.${verifier}`, {
      path: '/auth',
      httpOnly: true,
      secure: config.NODE_ENV === 'production',
      sameSite: 'lax',
      signed: true,
      maxAge: 600,
    });

    const params = new URLSearchParams({
      client_id: config.GOOGLE_CLIENT_ID,
      redirect_uri: `${config.APP_URL}/auth/google/callback`,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'online',
      prompt: 'select_account',
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });

    return reply.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  });

  // ---------------------------------------------------------------- Google OAuth2 Callback
  app.get('/google/callback', async (req, reply) => {
    const { code, state } = req.query as { code?: unknown; state?: unknown };

    // One-shot transaction cookie, always cleared.
    const raw = req.cookies[OAUTH_COOKIE];
    reply.clearCookie(OAUTH_COOKIE, { path: '/auth' });
    const unsigned = raw ? req.unsignCookie(raw) : null;
    const [savedState, verifier] = unsigned?.valid && unsigned.value ? unsigned.value.split('.') : [];

    const stateOk =
      typeof state === 'string' && !!savedState && state.length === savedState.length &&
      crypto.timingSafeEqual(Buffer.from(state), Buffer.from(savedState));
    if (!stateOk || !verifier || typeof code !== 'string' || !code) {
      await audit({ actor: null, action: 'LOGIN_FAILED', entityType: 'oauth', details: { reason: 'bad_state_or_code' }, ip: req.ip });
      return reply.redirect(fail('Sign in failed. Please try again.'));
    }

    try {
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        signal: AbortSignal.timeout(10_000),
        body: new URLSearchParams({
          code,
          client_id: config.GOOGLE_CLIENT_ID!,
          client_secret: config.GOOGLE_CLIENT_SECRET!,
          redirect_uri: `${config.APP_URL}/auth/google/callback`,
          grant_type: 'authorization_code',
          code_verifier: verifier,
        }),
      });
      if (!tokenRes.ok) throw new Error('Failed to exchange code for tokens');

      const tokenData = (await tokenRes.json()) as { access_token?: string };
      const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (!userRes.ok) throw new Error('Failed to fetch user info');

      const profile = (await userRes.json()) as { email?: string; email_verified?: boolean };
      if (typeof profile.email !== 'string' || profile.email_verified !== true) {
        await audit({ actor: null, action: 'LOGIN_FAILED', entityType: 'oauth', details: { reason: 'email_unverified' }, ip: req.ip });
        return reply.redirect(fail('Your Google email address is not verified.'));
      }
      const email = profile.email.toLowerCase().trim();

      const role = await lookupRole(email);
      if (!role) {
        await audit({ actor: email, action: 'LOGIN_FAILED', entityType: 'oauth', details: { reason: 'not_on_roster' }, ip: req.ip });
        return reply.redirect(fail('Your email is not on the feedback roster. Contact your course coordinator.'));
      }

      const token = await createSession(email, role, req.ip, req.headers['user-agent']);
      reply.setCookie(COOKIE_NAME, token, sessionCookie);
      return reply.redirect(config.APP_URL);
    } catch (err) {
      req.log.error({ err }, 'OAuth callback failure');
      await audit({ actor: null, action: 'LOGIN_FAILED', entityType: 'oauth', details: { reason: 'exchange_error' }, ip: req.ip }).catch(() => {});
      return reply.redirect(fail('Sign in failed'));
    }
  });
};
