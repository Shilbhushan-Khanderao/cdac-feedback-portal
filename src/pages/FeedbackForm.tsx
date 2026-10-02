import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { must, supabase } from '../lib/supabase';
import { fmt, sessionStatus } from '../lib/format';
import type { Question } from '../reports/aggregate';

export function FeedbackForm() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const set = (q: string, v: string) => setAnswers((a) => ({ ...a, [q]: v }));

  const { data, isLoading, error } = useQuery({
    queryKey: ['feedback', id],
    queryFn: async () => {
      const [session, subs] = await Promise.all([
        must(supabase.from('feedback_sessions').select('*, modules(name)').eq('id', id).maybeSingle()),
        must(supabase.from('submissions').select('session_id').eq('session_id', id)),
      ]);
      return session && { ...session, questions: session.questions as Question[], done: subs.length > 0 };
    },
  });

  const submit = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('submit_feedback', { p_session: id, p_answers: answers });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success('Feedback submitted. Thank you!');
      void queryClient.invalidateQueries({ queryKey: ['my-sessions'] });
      void queryClient.invalidateQueries({ queryKey: ['feedback', id] });
      navigate('/');
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) return <p className="muted">Loading…</p>;
  if (error) return <p className="text-red-600">{error.message}</p>;
  if (!data) return <Message text="This feedback link is not for your batch, or it was removed." />;
  if (data.done) return <Message text="You have already submitted this feedback. Thank you!" />;
  const status = sessionStatus(data);
  if (status !== 'open') {
    return <Message text={status === 'upcoming' ? `Opens ${fmt(data.opens_at)}.` : 'This feedback window has closed.'} />;
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit.mutate();
  };

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold">{data.modules?.name}</h1>
        {data.faculty.length > 0 && <p className="muted">Faculty: {data.faculty.join(', ')}</p>}
        <p className="muted">Your answers are anonymous. Closes {fmt(data.closes_at)}.</p>
      </div>

      {data.questions.map((q, i) =>
        q.kind === 'choice' ? (
          <fieldset key={q.id} className="card">
            <legend className="mb-3 font-medium">
              {i + 1}. {q.text}
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
                  <span className="block rounded-full border border-slate-300 px-4 py-2 text-sm peer-checked:border-indigo-600 peer-checked:bg-indigo-600 peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-300">
                    {o}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : (
          <div key={q.id} className="card">
            <label htmlFor={q.id} className="mb-3 block font-medium">
              {i + 1}. {q.text} <span className="muted">(optional)</span>
            </label>
            <textarea
              id={q.id}
              rows={3}
              maxLength={2000}
              className="input"
              value={answers[q.id] ?? ''}
              onChange={(e) => set(q.id, e.target.value)}
            />
          </div>
        ),
      )}

      <button className="btn btn-primary w-full py-3 text-base" disabled={submit.isPending}>
        {submit.isPending ? 'Submitting…' : 'Submit feedback'}
      </button>
    </form>
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
