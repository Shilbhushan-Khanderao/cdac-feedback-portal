type Status = 'upcoming' | 'open' | 'closed';

export function sessionStatus(s: { opens_at: string; closes_at: string }, now = Date.now()): Status {
  if (now < Date.parse(s.opens_at)) return 'upcoming';
  return now > Date.parse(s.closes_at) ? 'closed' : 'open';
}

const dateTime = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
export const fmt = (iso: string) => dateTime.format(new Date(iso));

/** ISO string to the value a <input type="datetime-local"> expects, in local time. */
export function toLocalInput(iso: string | Date): string {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export const STATUS_STYLE: Record<Status, string> = {
  upcoming: 'bg-amber-50 text-amber-700',
  open: 'bg-green-50 text-green-700',
  closed: 'bg-stone-100 text-stone-600',
};

/** Turn rate-limit / overload errors into advice a student can act on; pass others through. */
export function friendlyError(message: string): string {
  if (/<\s*(html|!doctype)/i.test(message)) return 'The service is unavailable. Wait a few seconds and try again.';
  if (/rate limit|too many requests/i.test(message)) return 'Many students are signing in right now. Wait one minute and try again.';
  if (/service unavailable|connection pool|timed out|failed to fetch|fetch failed|network/i.test(message)) {
    return 'The server is busy. Wait a few seconds and try again. Your answers are kept.';
  }
  return message;
}

// Fixed set of messages the server's OAuth callback actually redirects with
// (apps/api/src/modules/auth/routes.ts). `?error_description=` is attacker-controllable
// (a crafted link), so anything outside this exact allowlist must never reach
// the DOM as free text — fall back to one generic message instead (CL-4).
const LOGIN_ERRORS: Record<string, string> = {
  'Sign in failed. Please try again.': 'Sign-in failed. Please try again.',
  'Sign in failed': 'Sign-in failed. Please try again.',
  'Your Google email address is not verified.': 'Your Google account email is not verified. Verify it with Google and try again.',
  'Your email is not on the feedback roster. Contact your course coordinator.': 'Your email is not on the feedback roster. Contact your course coordinator.',
};
const GENERIC_LOGIN_ERROR = 'Sign-in failed. Please try again.';

/** Map a raw `error_description` query param to a fixed, known-safe message. */
export function loginError(raw: string): string {
  return LOGIN_ERRORS[raw] ?? GENERIC_LOGIN_ERROR;
}

/** Copy a student feedback link to the clipboard. */
export async function copyFeedbackLink(url: string) {
  await navigator.clipboard.writeText(url);
}

/** Native share sheet, falling back to WhatsApp web. */
export async function shareFeedbackLink(url: string, moduleName: string) {
  const title = `C-DAC Feedback: ${moduleName}`;
  const text = `Please submit your anonymous feedback for ${moduleName}:`;
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
    }
  }
  window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(`${text} ${url}`)}`, '_blank', 'noopener');
}
