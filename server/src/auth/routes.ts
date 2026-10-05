import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { config } from '../config.js';
import { query, withUser } from '../db/pool.js';
import { createSession, destroySession, getSession } from './session.js';

const COOKIE_NAME = 'cdac_session';

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

  // ---------------------------------------------------------------- Logout
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

  // ---------------------------------------------------------------- Dev Login (Development Only)
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

      // Roster check
      const staffRes = await query<{ role: 'cc' | 'admin' }>(
        'SELECT role FROM public.staff_roster WHERE email = $1',
        [email]
      );
      const studentRes = await query(
        'SELECT 1 FROM public.student_roster WHERE email = $1',
        [email]
      );

      let role: 'student' | 'cc' | 'admin' | null = null;
      if (staffRes.rows[0]) {
        role = staffRes.rows[0].role;
      } else if (studentRes.rows[0]) {
        role = 'student';
      }

      if (!role) {
        return reply.status(403).send({
          error: 'This account is not on the feedback roster. Ask your course coordinator to add your email.',
        });
      }

      const sessionId = await createSession(email, role, req.ip, req.headers['user-agent']);

      reply.setCookie(COOKIE_NAME, sessionId, {
        path: '/',
        httpOnly: true,
        secure: config.NODE_ENV === 'production',
        sameSite: 'lax',
        signed: true,
        maxAge: config.SESSION_TTL_HOURS * 3600,
      });

      const user = await withUser(email, async (client) => {
        const res = await client.query('SELECT whoami() AS me');
        return res.rows[0]?.me;
      });

      return reply.send({ ok: true, user });
    });
  }

  // ---------------------------------------------------------------- Google OAuth2 Initiation
  app.get('/google', async (req, reply) => {
    if (!config.GOOGLE_CLIENT_ID) {
      return reply.status(501).send({ error: 'Google OAuth not configured in this environment.' });
    }

    const redirectUri = `${config.APP_URL}/auth/google/callback`;
    const params = new URLSearchParams({
      client_id: config.GOOGLE_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'online',
      prompt: 'select_account',
    });

    return reply.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  });

  // ---------------------------------------------------------------- Google OAuth2 Callback
  app.get('/google/callback', async (req, reply) => {
    const { code } = req.query as { code?: string };
    if (!code) {
      return reply.redirect(`${config.APP_URL}?error_description=No+authorization+code+received`);
    }

    try {
      const redirectUri = `${config.APP_URL}/auth/google/callback`;
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: config.GOOGLE_CLIENT_ID!,
          client_secret: config.GOOGLE_CLIENT_SECRET!,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      });

      if (!tokenRes.ok) {
        throw new Error('Failed to exchange code for tokens');
      }

      const tokenData = await tokenRes.json();
      const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });

      if (!userRes.ok) {
        throw new Error('Failed to fetch user info');
      }

      const profile = await userRes.json();
      const email = (profile.email as string).toLowerCase().trim();

      // Pre-callback roster check
      const staffRes = await query<{ role: 'cc' | 'admin' }>(
        'SELECT role FROM public.staff_roster WHERE email = $1',
        [email]
      );
      const studentRes = await query(
        'SELECT 1 FROM public.student_roster WHERE email = $1',
        [email]
      );

      let role: 'student' | 'cc' | 'admin' | null = null;
      if (staffRes.rows[0]) role = staffRes.rows[0].role;
      else if (studentRes.rows[0]) role = 'student';

      if (!role) {
        return reply.redirect(
          `${config.APP_URL}?error_description=Your+email+(${encodeURIComponent(
            email
          )})+is+not+on+the+feedback+roster.`
        );
      }

      const sessionId = await createSession(email, role, req.ip, req.headers['user-agent']);
      reply.setCookie(COOKIE_NAME, sessionId, {
        path: '/',
        httpOnly: true,
        secure: config.NODE_ENV === 'production',
        sameSite: 'lax',
        signed: true,
        maxAge: config.SESSION_TTL_HOURS * 3600,
      });

      return reply.redirect(config.APP_URL);
    } catch (err: any) {
      req.log.error(err, 'OAuth callback failure');
      return reply.redirect(`${config.APP_URL}?error_description=Sign+in+failed`);
    }
  });
};
