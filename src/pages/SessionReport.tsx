import { useMemo, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router';
import { toPng } from 'html-to-image';
import { toast } from 'sonner';
import { api } from '../lib/api';
import { fmt, sessionStatus, STATUS_STYLE, toLocalInput } from '../lib/format';
import { aggregate, toCsv, type Answers, type Question } from '../reports/aggregate';
import { PieChart } from '../reports/PieChart';
import { CommentAnalysis } from '../reports/CommentAnalysis';
import { FacultyPicker } from './FacultyPicker';

function download(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export default function SessionReport() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const chartRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [facultyDraft, setFacultyDraft] = useState<string[] | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['report', id],
    queryFn: async () => {
      const session = await api.sessions.get(id).catch(() => null);
      if (!session) return null;
      const [result, submissions, roster] = await Promise.all([
        // Answers come only from session_report(): after close, at least 3, in random order.
        api.reports.get(id),
        api.feedback.submissions(id),
        api.roster.list({
          batch_id: session.batch_id,
          centre_id: session.centre_id,
          course_id: session.course_id,
        }),
      ]);
      const submitted = new Set(submissions.map((s) => s.email));
      const answers = result as { status: 'open' | 'too_few' | 'ready'; answers: Answers[] };
      return {
        session,
        questions: session.questions as Question[],
        answers: answers.answers,
        resultStatus: answers.status,
        submittedCount: submitted.size,
        roster,
        pending: roster.filter((s) => !submitted.has(s.email)),
      };
    },
  });

  const report = useMemo(() => data && aggregate(data.questions, data.answers), [data]);

  const reschedule = useMutation({
    mutationFn: (form: FormData) =>
      api.sessions.reschedule(
        id,
        new Date(form.get('opens') as string).toISOString(),
        new Date(form.get('closes') as string).toISOString(),
      ),
    onSuccess: () => {
      toast.success('Schedule updated');
      void queryClient.invalidateQueries({ queryKey: ['report', id] });
      void queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
    onError: (e) => toast.error(e.message),
  });

  const saveFaculty = useMutation({
    mutationFn: (faculty: string[]) => api.sessions.updateFaculty(id, faculty),
    onSuccess: () => {
      toast.success('Faculty updated');
      setFacultyDraft(null);
      void queryClient.invalidateQueries({ queryKey: ['report', id] });
    },
    onError: (e) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: () => api.sessions.delete(id),
    onSuccess: () => {
      toast.success('Session deleted');
      void queryClient.invalidateQueries({ queryKey: ['sessions'] });
      navigate('/sessions');
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) return <p className="muted">Loading…</p>;
  if (error) return <p className="text-red-600">{error.message}</p>;
  if (!data || !report) return <p className="card">Session not found, or not in your centre.</p>;

  const { session, roster, pending, resultStatus, submittedCount } = data;
  const status = sessionStatus(session);
  const closed = status === 'closed';
  const moduleName = session.modules?.name ?? '';
  const courseCode = session.courses?.code ?? '';
  const centreName = session.centres?.name ?? '';
  const batchLabel = session.batches?.label ?? '';
  const fileBase = `feedback_${courseCode}_${session.modules?.short_name || moduleName}_${centreName}_${batchLabel}`.replace(/[^\w-]+/g, '_');

  const copyLink = async () => {
    await navigator.clipboard.writeText(`${location.origin}${location.pathname}#/feedback/${id}`);
    toast.success('Link copied. Share it with the batch.');
  };

  const downloadPdf = async () => {
    setPdfBusy(true);
    try {
      // react-pdf is large: load it only when a PDF is requested.
      const [{ pdf }, { ReportDocument }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('../reports/ReportDocument'),
      ]);
      const chartImages: string[] = [];
      for (const el of chartRefs.current) if (el) chartImages.push(await toPng(el, { pixelRatio: 2, backgroundColor: '#ffffff' }));
      const doc = (
        <ReportDocument
          title={`${courseCode} Module Feedback Report - ${moduleName}`}
          meta={[
            ['Module Name', moduleName],
            ['Centre', centreName],
            ['Batch', batchLabel],
            ...(session.faculty.length ? [['Faculty Name', session.faculty.join(', ')] as [string, string]] : []),
            ['Feedback window', `${fmt(session.opens_at)} to ${fmt(session.closes_at)}`],
            ['Total Feedback Count', `${report.total} of ${roster.length}`],
          ]}
          chartImages={chartImages}
          comments={report.comments}
        />
      );
      download(await pdf(doc).toBlob(), `${fileBase}.pdf`);
    } catch (e) {
      toast.error(`PDF failed: ${(e as Error).message}`);
    } finally {
      setPdfBusy(false);
    }
  };

  const onReschedule = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    reschedule.mutate(new FormData(e.currentTarget));
  };

  return (
    <div className="space-y-4">
      <Link to="/sessions" className="muted hover:underline">
        ← Sessions
      </Link>

      <div className="card space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold">{moduleName}</h1>
          <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[status]}`}>{status}</span>
        </div>
        <p className="muted">
          {courseCode} · {centreName} · {batchLabel}
        </p>
        {facultyDraft ? (
          <div className="space-y-2 rounded-lg border border-stone-200 p-3">
            <FacultyPicker centreId={session.centre_id} value={facultyDraft} onChange={setFacultyDraft} />
            <div className="flex gap-2">
              <button className="btn btn-primary" disabled={saveFaculty.isPending} onClick={() => saveFaculty.mutate(facultyDraft)}>
                Save faculty
              </button>
              <button className="btn" onClick={() => setFacultyDraft(null)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm">
            Faculty: {session.faculty.length ? session.faculty.join(', ') : <span className="text-amber-700">not set</span>}{' '}
            <button className="text-brand-700 hover:underline" onClick={() => setFacultyDraft(session.faculty)}>
              Edit
            </button>
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-primary" onClick={copyLink}>
            Copy student link
          </button>
          <button className="btn" onClick={downloadPdf} disabled={pdfBusy || report.total === 0}>
            {pdfBusy ? 'Preparing PDF…' : 'Download PDF'}
          </button>
          <button
            className="btn"
            disabled={report.total === 0}
            onClick={() => download(new Blob([String.fromCharCode(0xfeff) + toCsv(data.questions, data.answers)], { type: 'text/csv' }), `${fileBase}.csv`)}
          >
            Download CSV
          </button>
          {submittedCount === 0 && (
            <button className="btn btn-danger" onClick={() => confirm('Delete this session?') && remove.mutate()}>
              Delete
            </button>
          )}
        </div>
        {closed ? (
          <p className="muted border-t border-stone-100 pt-3">
            Ran {fmt(session.opens_at)} to {fmt(session.closes_at)}. The schedule is final after a session closes.
          </p>
        ) : (
          <form onSubmit={onReschedule} className="flex flex-wrap items-end gap-2 border-t border-stone-100 pt-3">
            <div>
              <label className="label" htmlFor="opens">Opens</label>
              <input id="opens" name="opens" type="datetime-local" className="input" required defaultValue={toLocalInput(session.opens_at)} />
            </div>
            <div>
              <label className="label" htmlFor="closes">Closes</label>
              <input id="closes" name="closes" type="datetime-local" className="input" required defaultValue={toLocalInput(session.closes_at)} />
            </div>
            <button className="btn" disabled={reschedule.isPending}>
              Update schedule
            </button>
            <span className="muted">Set Closes to now to end early. After closing, the schedule is final.</span>
          </form>
        )}
      </div>

      <div className="card">
        <p className="font-medium">
          {submittedCount} of {roster.length} students submitted
        </p>
        {resultStatus !== 'ready' && (
          <p className="muted mt-1">
            {resultStatus === 'open'
              ? `To keep answers anonymous, results appear after the session closes (${fmt(session.closes_at)}).`
              : 'Results are hidden because fewer than 3 students responded. This keeps answers anonymous.'}
          </p>
        )}
        {pending.length > 0 && (
          <details className="mt-2">
            <summary className="cursor-pointer text-sm text-brand-700">{pending.length} not submitted yet</summary>
            <ul className="mt-2 columns-1 text-sm sm:columns-2">
              {pending.map((s) => (
                <li key={s.email}>
                  {s.prn} · {s.full_name}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      {report.total > 0 && (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            {report.charts.map((c) => (
              <div key={c.title} className="card">
                <PieChart title={c.title} data={c.data} />
              </div>
            ))}
          </div>
          {report.comments.map((c) => (
            <div key={c.title} className="card">
              <h2 className="mb-2 font-semibold">{c.title}</h2>
              {c.items.length === 0 ? (
                <p className="muted">No comments recorded for this section.</p>
              ) : (
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {c.items.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              )}
              <CommentAnalysis comments={c.items} />
            </div>
          ))}

          {/* Off-screen, fixed-width, non-animated copies of the charts for PDF capture. */}
          <div aria-hidden style={{ position: 'absolute', left: -9999, top: 0, width: 800 }}>
            {report.charts.map((c, i) => (
              <div key={c.title} ref={(el) => void (chartRefs.current[i] = el)}>
                <PieChart title={c.title} data={c.data} animated={false} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
