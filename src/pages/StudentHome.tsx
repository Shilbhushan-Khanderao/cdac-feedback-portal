import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api } from '../lib/api';
import { fmt, sessionStatus } from '../lib/format';

export function StudentHome() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['my-sessions'],
    queryFn: async () => {
      const [sessions, subs] = await Promise.all([
        api.sessions.list(),
        api.feedback.mySubmissions(),
      ]);
      const done = new Set(subs.map((s) => s.session_id));
      return sessions.map((s) => ({ ...s, done: done.has(s.id), status: sessionStatus(s) }));
    },
  });

  if (isLoading) return <p className="muted">Loading…</p>;
  if (error) return <p className="text-red-600">{error.message}</p>;

  const pending = data!.filter((s) => s.status === 'open' && !s.done);
  const upcoming = data!.filter((s) => s.status === 'upcoming');
  const past = data!.filter((s) => s.done || s.status === 'closed').reverse();

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h1 className="text-lg font-semibold">Pending feedback</h1>
        {pending.length === 0 && <p className="card muted">Nothing pending. Thank you!</p>}
        {pending.map((s) => (
          <Link key={s.id} to={`/feedback/${s.id}`} className="card block hover:border-brand-400">
            <div className="font-medium">{s.modules?.name}</div>
            {s.faculty.length > 0 && <div className="muted">{s.faculty.join(', ')}</div>}
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-sm text-amber-700">Closes {fmt(s.closes_at)}</span>
              <span className="btn btn-primary">Give feedback</span>
            </div>
          </Link>
        ))}
      </section>

      {upcoming.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold text-stone-600">Upcoming</h2>
          {upcoming.map((s) => (
            <div key={s.id} className="card muted">
              {s.modules?.name}: opens {fmt(s.opens_at)}
            </div>
          ))}
        </section>
      )}

      {past.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold text-stone-600">Past</h2>
          {past.map((s) => (
            <div key={s.id} className="card flex justify-between text-sm">
              <span>{s.modules?.name}</span>
              <span className={s.done ? 'text-green-700' : 'text-stone-400'}>{s.done ? 'Submitted' : 'Missed'}</span>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
