import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { feedbackApi } from './api';
import { sessionsApi } from '../../shared/sessionsApi';
import { fmt, friendlyError, sessionStatus } from '../../shared/format';
import { ArrowRight, CheckCircle, Clock, Lock, Confetti } from '@phosphor-icons/react';

export function StudentHome() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['my-sessions'],
    queryFn: async () => {
      const [sessions, subs] = await Promise.all([
        sessionsApi.list(),
        feedbackApi.mySubmissions(),
      ]);
      const done = new Set(subs.map((s) => s.session_id));
      return sessions.map((s) => ({ ...s, done: done.has(s.id), status: sessionStatus(s) }));
    },
  });

  if (isLoading) return <p className="muted">Loading…</p>;
  if (error) return <p role="alert" className="text-red-600">{friendlyError(error.message)}</p>;

  const pending = data!.filter((s) => s.status === 'open' && !s.done);
  const upcoming = data!.filter((s) => s.status === 'upcoming');
  const past = data!.filter((s) => s.done || s.status === 'closed').reverse();

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h1 className="page-title">Pending feedback</h1>
        {pending.length === 0 && (
          <div className="card space-y-2 text-center py-8">
            <Confetti size={32} className="mx-auto text-brand-600" aria-hidden />
            <p className="font-medium text-stone-800">All caught up.</p>
            <p className="text-xs text-stone-500">No pending feedback sessions for your batch right now.</p>
          </div>
        )}
        {pending.map((s) => {
          const count = s.question_count || 6;
          const estMin = Math.max(1, Math.round(count * 0.4));
          return (
            <Link
              key={s.id}
              to={`/feedback/${s.id}`}
              className="card block space-y-3 transition hover:border-brand-500 hover:shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="text-base font-semibold text-stone-900">{s.modules?.name}</div>
                  {s.faculty.length > 0 && <div className="text-sm muted">Faculty: {s.faculty.join(', ')}</div>}
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                    <Lock size={12} aria-hidden /> Anonymous
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-medium text-stone-600">
                    <Clock size={12} aria-hidden /> ~{estMin} min ({count} questions)
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between border-t border-stone-100 pt-3">
                <span className="text-xs text-amber-700 font-medium">Closes {fmt(s.closes_at)}</span>
                <span className="btn btn-primary text-xs py-1.5 px-3">Give feedback <ArrowRight size={12} aria-hidden /></span>
              </div>
            </Link>
          );
        })}
      </section>

      {upcoming.length > 0 && (
        <section className="space-y-2">
          <h2 className="section-title">Upcoming</h2>
          {upcoming.map((s) => (
            <div key={s.id} className="card muted text-sm flex justify-between items-center">
              <span>{s.modules?.name}</span>
              <span className="text-xs text-stone-500">Opens {fmt(s.opens_at)}</span>
            </div>
          ))}
        </section>
      )}

      {past.length > 0 && (
        <section className="space-y-2">
          <h2 className="section-title">Past sessions</h2>
          {past.map((s) => (
            <div key={s.id} className="card flex justify-between items-center text-sm py-2.5">
              <span className="text-stone-700">{s.modules?.name}</span>
              <span
                className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                  s.done ? 'bg-emerald-50 text-emerald-700' : 'bg-stone-100 text-stone-500'
                }`}
              >
                {s.done ? <><CheckCircle size={12} aria-hidden /> Submitted</> : 'Closed'}
              </span>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
