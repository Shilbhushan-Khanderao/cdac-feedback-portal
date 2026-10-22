import { withUser } from '../../db/pool.js';

// CMP-4: literal for now. No admin UI exists to manage notice versions yet (YAGNI) — bump
// this string and ship a new migration/notice the day that changes.
const CONSENT_VERSION = 'v1';

export async function recordConsent(email: string) {
  await withUser(email, async (client) => {
    await client.query(
      `INSERT INTO public.consent_records (email, version, accepted_at)
       VALUES ($1, $2, now())
       ON CONFLICT (email, version) DO UPDATE SET accepted_at = now()`,
      [email, CONSENT_VERSION]
    );
  });
}
