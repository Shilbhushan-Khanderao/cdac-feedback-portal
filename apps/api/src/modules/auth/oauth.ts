import crypto from 'node:crypto';
import { config } from '../../config.js';

const b64url = (b: Buffer) => b.toString('base64url');
const REDIRECT_URI = `${config.APP_URL}/auth/google/callback`;

/** Fresh state + PKCE verifier and the Google consent URL that carries them. */
export function newAuthRequest() {
  const state = b64url(crypto.randomBytes(24));
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());

  const params = new URLSearchParams({
    client_id: config.GOOGLE_CLIENT_ID!,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'online',
    prompt: 'select_account',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  return { state, verifier, url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` };
}

export function stateMatches(state: unknown, saved: string | undefined): boolean {
  return (
    typeof state === 'string' && !!saved && state.length === saved.length &&
    crypto.timingSafeEqual(Buffer.from(state), Buffer.from(saved))
  );
}

/** Exchanges the auth code for tokens and returns the Google profile. Throws on any upstream failure. */
export async function fetchGoogleProfile(code: string, verifier: string) {
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    signal: AbortSignal.timeout(10_000),
    body: new URLSearchParams({
      code,
      client_id: config.GOOGLE_CLIENT_ID!,
      client_secret: config.GOOGLE_CLIENT_SECRET!,
      redirect_uri: REDIRECT_URI,
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

  return (await userRes.json()) as { email?: string; email_verified?: boolean };
}
