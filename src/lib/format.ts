export type Status = 'upcoming' | 'open' | 'closed';

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
  closed: 'bg-slate-100 text-slate-600',
};

/** Turn rate-limit / overload errors into advice a student can act on; pass others through. */
export function friendlyError(message: string): string {
  if (/rate limit/i.test(message)) return 'Many students are signing in right now. Wait one minute and try again.';
  if (/connection pool|timed out|failed to fetch|fetch failed|network/i.test(message)) {
    return 'The server is busy. Wait a few seconds and try again. Your answers are kept.';
  }
  return message;
}
