import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { api } from '../lib/api';
import { copyFeedbackLink, fmt, shareFeedbackLink, sessionStatus, STATUS_STYLE } from '../lib/format';
import { cohortKey, useBatches, useCohortSizes, useCourses } from '../lib/reference';
import { CreateSessionForm } from './sessions/CreateSessionForm';
import { ArrowRight, Clipboard, Confetti, Warning, WhatsappLogo, X } from '@phosphor-icons/react';

export function SessionsPage() {
  const [batchFilter, setBatchFilter] = useState('');
  const [courseFilter, setCourseFilter] = useState('');
  const [creating, setCreating] = useState(false);
  const [createdSession, setCreatedSession] = useState<{ id: string; moduleName?: string } | null>(null);
  const batches = useBatches();
  const courses = useCourses();
  const sizes = useCohortSizes();
  const sessions = useQuery({
    queryKey: ['sessions'],
    queryFn: () => api.sessions.list(),
  });

  const rows = (sessions.data ?? []).filter(
    (s) => (!batchFilter || s.batch_id === batchFilter) && (!courseFilter || s.course_id === courseFilter),
  );

  // Attention banner: open sessions with < 50% response rate
  const attention = rows.filter((s) => {
    const status = sessionStatus(s);
    const size = sizes.data?.get(cohortKey(s)) ?? 0;
    const subsCount = s.submissions ? s.submissions.length : 0;
    return status === 'open' && size > 0 && subsCount / size < 0.5;
  });

  const studentLink = createdSession ? `${location.origin}${location.pathname}#/feedback/${createdSession.id}` : '';

  const copyCreatedLink = async () => {
    await copyFeedbackLink(studentLink);
    toast.success('Feedback link copied to clipboard!');
  };
  const shareCreatedLink = () => shareFeedbackLink(studentLink, createdSession?.moduleName ?? 'the module');

  return (
    <div className="space-y-4">
      <h1 className="page-title">Sessions</h1>
      <div className="flex flex-wrap items-center gap-2">
        <select className="input w-auto" aria-label="Filter by batch" value={batchFilter} onChange={(e) => setBatchFilter(e.target.value)}>
          <option value="">All batches</option>
          {batches.data?.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
        </select>
        <select className="input w-auto" aria-label="Filter by course" value={courseFilter} onChange={(e) => setCourseFilter(e.target.value)}>
          <option value="">All courses</option>
          {courses.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.code}
            </option>
          ))}
        </select>
        <button className="btn btn-primary" onClick={() => setCreating((v) => !v)}>
          {creating ? 'Cancel' : '+ New session'}
        </button>
      </div>

      {/* Immediate Link Card on Creation */}
      {createdSession && (
        <div className="card border-2 border-emerald-500 bg-emerald-50/50 p-4 space-y-3">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2 font-bold text-stone-900">
                <Confetti size={20} aria-hidden />
                <span>Session Created: {createdSession.moduleName ?? 'Module'}</span>
              </div>
              <p className="text-xs text-stone-600">
                Share this direct anonymous link with your students on WhatsApp or Slack:
              </p>
            </div>
            <button onClick={() => setCreatedSession(null)} aria-label="Dismiss" className="text-stone-400 hover:text-stone-600 p-1">
              <X size={16} aria-hidden />
            </button>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-2">
            <input
              readOnly
              className="input font-mono text-xs select-all bg-white flex-1"
              value={studentLink}
            />
            <div className="flex gap-2 w-full sm:w-auto">
              <button className="btn btn-primary text-xs py-2 px-3 whitespace-nowrap" onClick={copyCreatedLink}>
                <Clipboard size={14} aria-hidden /> Copy Link
              </button>
              <button className="btn text-xs py-2 px-3 whitespace-nowrap bg-emerald-700 text-white hover:bg-emerald-800" onClick={shareCreatedLink}>
                <WhatsappLogo size={14} aria-hidden /> Share to WhatsApp
              </button>
            </div>
          </div>
          <div className="flex justify-between items-center pt-1 border-t border-emerald-200/50 text-xs">
            <Link to={`/sessions/${createdSession.id}`} className="inline-flex items-center gap-1 text-brand-700 font-semibold hover:underline">
              View Session Page & Roster <ArrowRight size={12} aria-hidden />
            </Link>
            <button onClick={() => setCreatedSession(null)} className="text-stone-500 hover:text-stone-700">
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Attention Banner */}
      {attention.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50/70 p-3 text-xs text-amber-900 space-y-1.5">
          <div className="font-semibold flex items-center gap-1.5 text-sm">
            <Warning size={16} aria-hidden /> {attention.length} open session{attention.length > 1 ? 's need' : ' needs'} more responses (&lt;50% turn out)
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            {attention.map((s) => (
              <Link
                key={s.id}
                to={`/sessions/${s.id}`}
                className="inline-flex items-center gap-1 rounded bg-white px-2 py-1 border border-amber-200 font-medium text-amber-900 hover:bg-amber-100 transition"
              >
                {s.modules?.name}: {s.submissions?.length ?? 0} / {sizes.data?.get(cohortKey(s)) ?? 0} submitted <ArrowRight size={12} aria-hidden />
              </Link>
            ))}
          </div>
        </div>
      )}

      {creating && (
        <CreateSessionForm
          onDone={(created) => {
            setCreating(false);
            if (created) setCreatedSession(created);
          }}
        />
      )}

      {sessions.isLoading && <p className="muted">Loading…</p>}
      {sessions.error && <p role="alert" className="text-red-600">{sessions.error.message}</p>}
      {sessions.data && rows.length === 0 && <p className="card muted">No sessions yet. Create one with “New session”.</p>}

      <div className="space-y-2">
        {rows.map((s) => {
          const status = sessionStatus(s);
          const size = sizes.data?.get(cohortKey(s)) ?? 0;
          const done = s.submissions ? s.submissions.length : 0;
          const pct = size ? Math.round((100 * done) / size) : 0;
          return (
            <Link key={s.id} to={`/sessions/${s.id}`} className="card block hover:border-brand-400">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{s.modules?.name}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[status]}`}>{status}</span>
                <span className="ml-auto text-sm font-medium">
                  {done} / {size} submitted
                </span>
              </div>
              <div className="muted text-xs sm:text-sm">
                {s.centres?.name} · {s.courses?.code} · {s.batches?.label} · {fmt(s.opens_at)} – {fmt(s.closes_at)}
              </div>
              <div className="mt-2 h-1.5 rounded-full bg-stone-100 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    pct >= 80 ? 'bg-emerald-500' : pct >= 40 ? 'bg-brand-500' : 'bg-amber-500'
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
