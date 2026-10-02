import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { must, supabase } from '../lib/supabase';
import { fmt, sessionStatus, STATUS_STYLE, toLocalInput } from '../lib/format';
import { useFaculty, useModules, useMyBatches } from '../lib/reference';

export function SessionsPage() {
  const [batchFilter, setBatchFilter] = useState('');
  const [creating, setCreating] = useState(false);
  const batches = useMyBatches();
  const sessions = useQuery({
    queryKey: ['sessions'],
    queryFn: () =>
      must(
        supabase
          .from('feedback_sessions')
          .select('id, batch_id, opens_at, closes_at, faculty, modules(name), submissions(count)')
          .order('opens_at', { ascending: false }),
      ),
  });

  const batchById = new Map(batches.data?.map((b) => [b.id, b]));
  const rows = (sessions.data ?? []).filter((s) => !batchFilter || s.batch_id === batchFilter);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-lg font-semibold">Feedback sessions</h1>
        <select className="input w-auto" value={batchFilter} onChange={(e) => setBatchFilter(e.target.value)}>
          <option value="">All batches</option>
          {batches.data?.map((b) => (
            <option key={b.id} value={b.id}>
              {b.title}
            </option>
          ))}
        </select>
        <button className="btn btn-primary" onClick={() => setCreating((v) => !v)}>
          {creating ? 'Cancel' : 'New session'}
        </button>
      </div>

      {creating && <NewSession onDone={() => setCreating(false)} />}

      {sessions.isLoading && <p className="muted">Loading…</p>}
      {sessions.error && <p className="text-red-600">{sessions.error.message}</p>}
      {sessions.data && rows.length === 0 && <p className="card muted">No sessions yet. Create one with “New session”.</p>}

      <div className="space-y-2">
        {rows.map((s) => {
          const status = sessionStatus(s);
          const batch = batchById.get(s.batch_id);
          const done = s.submissions[0]?.count ?? 0;
          const pct = batch?.size ? Math.round((100 * done) / batch.size) : 0;
          return (
            <Link key={s.id} to={`/sessions/${s.id}`} className="card block hover:border-indigo-400">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{s.modules?.name}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[status]}`}>{status}</span>
                <span className="ml-auto text-sm">
                  {done} / {batch?.size ?? '?'} submitted
                </span>
              </div>
              <div className="muted">
                {batch?.title} · {fmt(s.opens_at)} – {fmt(s.closes_at)}
              </div>
              <div className="mt-2 h-1.5 rounded bg-slate-100">
                <div className="h-1.5 rounded bg-indigo-500" style={{ width: `${pct}%` }} />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function NewSession({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();
  const batches = useMyBatches();
  const modules = useModules();
  const faculty = useFaculty();
  const [batchId, setBatchId] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const courseId = batches.data?.find((b) => b.id === batchId)?.course_id;

  const create = useMutation({
    mutationFn: (form: FormData) =>
      must(
        supabase.from('feedback_sessions').insert({
          batch_id: batchId,
          module_id: form.get('module') as string,
          faculty: picked,
          opens_at: new Date(form.get('opens') as string).toISOString(),
          closes_at: new Date(form.get('closes') as string).toISOString(),
        }),
      ),
    onSuccess: () => {
      toast.success('Session created. Open it to copy the link for students.');
      void queryClient.invalidateQueries({ queryKey: ['sessions'] });
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    create.mutate(new FormData(e.currentTarget));
  };

  return (
    <form onSubmit={onSubmit} className="card grid gap-4 sm:grid-cols-2">
      <div>
        <label className="label" htmlFor="batch">Batch</label>
        <select id="batch" className="input" required value={batchId} onChange={(e) => setBatchId(e.target.value)}>
          <option value="">Select batch</option>
          {batches.data?.filter((b) => b.active).map((b) => (
            <option key={b.id} value={b.id}>
              {b.title}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="module">Module</label>
        <select id="module" name="module" className="input" required disabled={!courseId}>
          <option value="">{courseId ? 'Select module' : 'Pick a batch first'}</option>
          {modules.data
            ?.filter((m) => m.course_id === courseId)
            .map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="opens">Opens</label>
        <input id="opens" name="opens" type="datetime-local" className="input" required defaultValue={toLocalInput(new Date())} />
      </div>
      <div>
        <label className="label" htmlFor="closes">Closes</label>
        <input
          id="closes"
          name="closes"
          type="datetime-local"
          className="input"
          required
          defaultValue={toLocalInput(new Date(Date.now() + 3 * 86400000))}
        />
      </div>
      <fieldset className="sm:col-span-2">
        <legend className="label">Faculty</legend>
        <div className="grid max-h-48 gap-1 overflow-y-auto rounded-lg border border-slate-200 p-2 sm:grid-cols-3">
          {faculty.data?.map((f) => (
            <label key={f.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={picked.includes(f.name)}
                onChange={(e) => setPicked((p) => (e.target.checked ? [...p, f.name] : p.filter((n) => n !== f.name)))}
              />
              {f.name}
            </label>
          ))}
        </div>
      </fieldset>
      <button className="btn btn-primary sm:col-span-2" disabled={create.isPending}>
        Create session
      </button>
    </form>
  );
}
