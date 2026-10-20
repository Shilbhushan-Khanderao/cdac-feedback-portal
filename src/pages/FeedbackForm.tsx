import { useState, useEffect, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { api } from '../lib/api';
import { fmt, friendlyError, sessionStatus } from '../lib/format';
import type { Question } from '../reports/aggregate';
import { useMe } from '../auth';
import { CheckCircle, Lock } from '@phosphor-icons/react';

type FeedbackSession = {
  id: string;
  modules?: { name: string };
  faculty: string[];
  questions: Question[];
  opens_at: string;
  closes_at: string;
  done: boolean;
};

export function FeedbackForm() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { email } = useMe();
  // Scoped per user (VAPT CL-1): an unscoped key let a second student on the same
  // shared lab PC see the first student's draft comment pre-filled.
  const draftKey = `cdac_draft_${email.toLowerCase()}_${id}`;

  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem(draftKey);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const [isCelebration, setIsCelebration] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(draftKey);
      if (saved && Object.keys(JSON.parse(saved)).length > 0) {
        toast.info('Restored your previously saved draft answers', { duration: 3000 });
      }
    } catch {
      // ignore
    }
  }, [draftKey]);

  const set = (q: string, v: string) => {
    setAnswers((a) => {
      const updated = { ...a, [q]: v };
      try {
        localStorage.setItem(draftKey, JSON.stringify(updated));
      } catch {
        // ignore storage errors
      }
      return updated;
    });
  };

  const { data, isLoading, error } = useQuery<FeedbackSession | null>({
    queryKey: ['feedback', id],
    queryFn: async () => {
      const [session, subs] = await Promise.all([
        api.sessions.get(id).catch(() => null),
        api.feedback.mySubmissions(),
      ]);
      if (!session) return null;
      const done = subs.some((s) => s.session_id === id);
      return { ...session, questions: (session.questions ?? []) as Question[], done };
    },
  });

  const submit = useMutation({
    mutationFn: async () => {
      await api.feedback.submit(id, answers);
    },
    onSuccess: () => {
      try {
        localStorage.removeItem(draftKey);
      } catch {
        // ignore
      }
      setIsCelebration(true);
      void queryClient.invalidateQueries({ queryKey: ['my-sessions'] });
      void queryClient.invalidateQueries({ queryKey: ['feedback', id] });
    },
    onError: (e) => toast.error(friendlyError(e.message)),
  });

  if (isLoading) return <p className="muted">Loading…</p>;
  if (error) return <p role="alert" className="text-red-600">{friendlyError(error.message)}</p>;
  if (!data) return <Message text="This feedback link is not for your batch, or it was removed." />;
  if (isCelebration) {
    return <CelebrationScreen moduleName={data.modules?.name} onDone={() => navigate('/')} />;
  }
  if (data.done) return <Message text="You have already submitted this feedback. Thank you!" />;
  const status = sessionStatus(data);
  if (status !== 'open') {
    return <Message text={status === 'upcoming' ? `Opens ${fmt(data.opens_at)}.` : 'This feedback window has closed.'} />;
  }

  const choiceQuestions = data.questions.filter((q) => q.kind === 'choice');
  const answeredRequired = choiceQuestions.filter((q) => Boolean(answers[q.id])).length;
  const totalRequired = choiceQuestions.length;
  const progressPercent = totalRequired > 0 ? Math.round((answeredRequired / totalRequired) * 100) : 100;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit.mutate();
  };

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-2xl space-y-4">
      {/* Sticky Progress Indicator */}
      <div className="sticky top-2 z-10 card p-3 shadow-md backdrop-blur bg-white/95 border-stone-200">
        <div className="flex items-center justify-between text-xs font-medium mb-1.5">
          <span className="text-stone-700">
            {answeredRequired === totalRequired ? (
              <span className="text-emerald-700 font-semibold flex items-center gap-1">
                <CheckCircle size={14} aria-hidden /> All required questions answered!
              </span>
            ) : (
              <span>
                Progress: <strong className="text-brand-700">{answeredRequired}</strong> of {totalRequired} questions
              </span>
            )}
          </span>
          <span className="text-stone-500 font-semibold">{progressPercent}%</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-stone-100" role="progressbar" aria-label="Required questions answered" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressPercent}>
          <div
            className={`h-full transition-all duration-300 ease-out ${
              progressPercent === 100 ? 'bg-emerald-600' : 'bg-brand-600'
            }`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      <div className="card space-y-1 bg-stone-50/70">
        <div className="flex items-center justify-between">
          <h1 className="page-title">{data.modules?.name}</h1>
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-xs font-semibold">
            <Lock size={12} aria-hidden /> Anonymous
          </span>
        </div>
        {data.faculty.length > 0 && <p className="text-sm muted">Faculty: {data.faculty.join(', ')}</p>}
        <p className="text-xs text-stone-500">
          Your answers are completely anonymous. Feedback closes on {fmt(data.closes_at)}.
        </p>
      </div>

      {data.questions.map((q, i) =>
        q.kind === 'choice' ? (
          <fieldset
            key={q.id}
            className={`card transition-colors ${answers[q.id] ? 'border-brand-200' : ''}`}
          >
            <legend className="mb-3 font-medium text-stone-900">
              <span className="text-brand-700 font-semibold mr-1">{i + 1}.</span> {q.text}
            </legend>
            <div className="flex flex-wrap gap-2">
              {q.options.map((o) => (
                <label key={o} className="cursor-pointer">
                  <input
                    type="radio"
                    name={q.id}
                    value={o}
                    required
                    className="peer sr-only"
                    checked={answers[q.id] === o}
                    onChange={() => set(q.id, o)}
                  />
                  <span className="block rounded-full border border-stone-300 px-4 py-2 text-sm peer-checked:border-brand-600 peer-checked:bg-brand-600 peer-checked:text-white peer-checked:font-medium peer-focus-visible:ring-2 peer-focus-visible:ring-brand-300 transition-all hover:bg-stone-50 peer-checked:hover:bg-brand-600">
                    {o}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : (
          <div
            key={q.id}
            className={`card transition-colors ${answers[q.id]?.trim() ? 'border-brand-200' : ''}`}
          >
            <label htmlFor={q.id} className="mb-2 block font-medium text-stone-900">
              <span className="text-brand-700 font-semibold mr-1">{i + 1}.</span> {q.text}{' '}
              <span className="text-xs text-stone-600 font-normal">(optional)</span>
            </label>
            <textarea
              id={q.id}
              rows={3}
              maxLength={2000}
              placeholder="Share constructive observations or comments..."
              className="input"
              value={answers[q.id] ?? ''}
              onChange={(e) => set(q.id, e.target.value)}
            />
          </div>
        ),
      )}

      <button
        className="btn btn-primary w-full py-3.5 text-base font-semibold shadow-sm transition hover:shadow"
        disabled={submit.isPending}
      >
        {submit.isPending ? 'Submitting…' : 'Submit Feedback'}
      </button>
    </form>
  );
}

function CelebrationScreen({
  moduleName,
  onDone,
}: {
  moduleName?: string;
  onDone: () => void;
}) {
  return (
    <div className="mx-auto max-w-md card text-center py-10 px-6 space-y-5">
      <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
        <svg viewBox="0 0 24 24" className="size-8" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      </div>

      <div className="space-y-1">
        <h2 className="text-2xl font-semibold text-stone-900">Thank You!</h2>
        <p className="text-stone-600">
          Your feedback for <strong className="text-stone-800">{moduleName ?? 'this module'}</strong> has been recorded.
        </p>
      </div>

      <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800 flex items-start gap-1.5">
        <Lock size={14} className="mt-0.5 shrink-0" aria-hidden />
        <span><strong>Anonymity Guaranteed:</strong> Your responses have been detached from your identity and stored securely.</span>
      </div>

      <button onClick={onDone} className="btn btn-primary w-full py-2.5 font-medium">
        Back to Dashboard
      </button>
    </div>
  );
}

function Message({ text }: { text: string }) {
  return (
    <div className="card mx-auto max-w-md space-y-3 text-center">
      <p>{text}</p>
      <Link to="/" className="btn">
        Back
      </Link>
    </div>
  );
}
