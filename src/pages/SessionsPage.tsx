import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { useMe } from '../auth';
import { api } from '../lib/api';
import { fmt, sessionStatus, STATUS_STYLE, toLocalInput } from '../lib/format';
import { cohortKey, useBatches, useCohortSizes, useCourses, useModules } from '../lib/reference';
import { CohortPicker, cohortReady, emptyCohort, type Cohort } from './CohortPicker';
import { FacultyPicker } from './FacultyPicker';

export function SessionsPage() {
  const [batchFilter, setBatchFilter] = useState('');
  const [courseFilter, setCourseFilter] = useState('');
  const [creating, setCreating] = useState(false);
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-lg font-semibold">Feedback sessions</h1>
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
          const size = sizes.data?.get(cohortKey(s)) ?? 0;
          const done = s.submissions.length;
          const pct = size ? Math.round((100 * done) / size) : 0;
          return (
            <Link key={s.id} to={`/sessions/${s.id}`} className="card block hover:border-brand-400">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{s.modules?.name}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[status]}`}>{status}</span>
                <span className="ml-auto text-sm">
                  {done} / {size} submitted
                </span>
              </div>
              <div className="muted">
                {s.centres?.name} · {s.courses?.code} · {s.batches?.label} · {fmt(s.opens_at)} – {fmt(s.closes_at)}
              </div>
              <div className="mt-2 h-1.5 rounded bg-stone-100">
                <div className="h-1.5 rounded bg-brand-500" style={{ width: `${pct}%` }} />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function NewSession({ onDone }: { onDone: () => void }) {
  const me = useMe();
  const queryClient = useQueryClient();
  const modules = useModules();
  const [cohort, setCohort] = useState<Cohort>(() => emptyCohort(me));
  const [faculty, setFaculty] = useState<string[]>([]);
  const single = cohort.centre_ids.length === 1;

  const create = useMutation({
    mutationFn: (form: FormData) =>
      api.sessions.create(
        // One session per centre: each centre keeps its own faculty, schedule and report.
        cohort.centre_ids.map((centre_id) => ({
          batch_id: cohort.batch_id,
          centre_id,
          course_id: cohort.course_id,
          module_id: form.get('module') as string,
          faculty: single ? faculty : [],
          opens_at: new Date(form.get('opens') as string).toISOString(),
          closes_at: new Date(form.get('closes') as string).toISOString(),
        })),
      ),
    onSuccess: () => {
      toast.success(single ? 'Session created. Open it to copy the link for students.' : `${cohort.centre_ids.length} sessions created.`);
      void queryClient.invalidateQueries({ queryKey: ['sessions'] });
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!cohortReady(cohort)) return toast.error('Pick batch, centre and course');
    create.mutate(new FormData(e.currentTarget));
  };

  return (
    <form onSubmit={onSubmit} className="card space-y-4">
      <CohortPicker
        value={cohort}
        onChange={(c) => {
          if (c.centre_ids.join() !== cohort.centre_ids.join()) setFaculty([]); // faculty belong to a centre
          setCohort(c);
        }}
        multiCentre
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="module">Module</label>
          <select id="module" name="module" className="input" required disabled={!cohort.course_id}>
            <option value="">{cohort.course_id ? 'Select module' : 'Pick a course first'}</option>
            {modules.data
              ?.filter((m) => m.course_id === cohort.course_id)
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
      </div>
      {single ? (
        <FacultyPicker centreId={cohort.centre_ids[0]} value={faculty} onChange={setFaculty} />
      ) : (
        cohort.centre_ids.length > 1 && (
          <p className="muted">One session per centre will be created. Each centre’s CC adds its faculty on the session page.</p>
        )
      )}
      <button className="btn btn-primary w-full" disabled={create.isPending}>
        Create session
      </button>
    </form>
  );
}
