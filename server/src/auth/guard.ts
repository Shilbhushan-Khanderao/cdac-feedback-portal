import type { FastifyRequest, FastifyReply } from 'fastify';
import { getSession, type UserSession } from './session.js';

const COOKIE_NAME = 'cdac_session';

declare module 'fastify' {
  interface FastifyRequest {
    user?: UserSession;
  }
}

export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  const rawCookie = req.cookies[COOKIE_NAME];
  if (!rawCookie) {
    return reply.status(401).send({ error: 'Unauthorized: No session' });
  }

  const unsigned = req.unsignCookie(rawCookie);
  if (!unsigned.valid || !unsigned.value) {
    return reply.status(401).send({ error: 'Unauthorized: Invalid session signature' });
  }

  const session = await getSession(unsigned.value);
  if (!session) {
    reply.clearCookie(COOKIE_NAME, { path: '/' });
    return reply.status(401).send({ error: 'Unauthorized: Session expired or invalid' });
  }

  req.user = session;
}

export async function requireStaff(req: FastifyRequest, reply: FastifyReply) {
  await requireAuth(req, reply);
  if (reply.sent) return;

  if (req.user?.role !== 'cc' && req.user?.role !== 'admin') {
    return reply.status(403).send({ error: 'Forbidden: Staff access required' });
  }
}

export async function requireAdmin(req: FastifyRequest, reply: FastifyReply) {
  await requireAuth(req, reply);
  if (reply.sent) return;

  if (req.user?.role !== 'admin') {
    return reply.status(403).send({ error: 'Forbidden: Admin access required' });
  }
}
