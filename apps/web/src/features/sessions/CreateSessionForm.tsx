import { useState, useEffect, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useMe } from '../../app/auth';
import { sessionsApi, type CreateSessionPayload } from '../../shared/sessionsApi';
import {
  cohortKey,
  useBatches,
  useCentres,
  useCohortSizes,
  useCourses,
  useModules,
} from '../../shared/reference';
import { durationText, fmt } from '../../shared/format';
import { CheckCircle, Warning } from '@phosphor-icons/react';
import { CohortPicker, cohortReady, emptyCohort, type Cohort } from '../../shared/CohortPicker';
import { FacultyPicker } from '../../shared/FacultyPicker';
import { ScheduleFields, type Schedule } from '../../shared/ScheduleFields';
import { Choice } from '../../shared/ui';

interface Props {
  onDone: (created?: { id: string; moduleName?: string }) => void;
}

export function CreateSessionForm({ onDone }: Props) {
  const me = useMe();
  const queryClient = useQueryClient();
  const modules = useModules();
  const batches = useBatches();
  const centres = useCentres();
  const courses = useCourses();
  const sizes = useCohortSizes();
  const [cohort, setCohort] = useState<Cohort>(() => emptyCohort(me));
  const [faculty, setFaculty] = useState<string[]>([]);
  const [moduleId, setModuleId] = useState('');
  const [schedule, setSchedule] = useState<Schedule>(() => {
    const now = Math.floor(Date.now() / 60000) * 60000;
    return {
      opens: new Date(now).toISOString(),
      closes: new Date(now + 3 * 86400000).toISOString(),
    };
  });
  const single = cohort.centre_ids.length === 1;

  // Pre-fill the active batch with the most students on the roster this user can see (for a CC:
  // their centre/course), so the usual case needs no change.
  useEffect(() => {
    if (cohort.batch_id || !batches.data?.length || !sizes.data) return;
    const count = (batchId: string) =>
      [...sizes.data.entries()].reduce(
        (n, [key, v]) => (key.startsWith(`${batchId}|`) ? n + v : n),
        0,
      );
    const active = batches.data.filter((b) => b.active);
    const best = [...active].sort((x, y) => count(y.id) - count(x.id))[0] ?? batches.data[0];
    setCohort((c) => ({ ...c, batch_id: best.id }));
  }, [batches.data, sizes.data, cohort.batch_id]);

  const create = useMutation({
    mutationFn: () => {
      const payload: CreateSessionPayload[] = cohort.centre_ids.map((centre_id) => ({
        batch_id: cohort.batch_id,
        centre_id,
        course_id: cohort.course_id,
        module_id: moduleId,
        faculty: single ? faculty : [],
        opens_at: schedule.opens,
        closes_at: schedule.closes,
      }));
      return sessionsApi.create(payload);
    },
    onSuccess: (data) => {
      const mod = modules.data?.find((m) => m.id === moduleId);
      const first = Array.isArray(data) ? data[0] : data;
      toast.success(single ? 'Session created' : `${cohort.centre_ids.length} sessions created`);
      void queryClient.invalidateQueries({ queryKey: ['sessions'] });
      onDone(first?.id ? { id: first.id, moduleName: mod?.name } : undefined);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // A CC usually has one choice per field: take it so they only pick the module.
  useEffect(() => {
    const active = courses.data?.filter((c) => c.active) ?? [];
    if (!cohort.course_id && active.length === 1)
      setCohort((c) => ({ ...c, course_id: active[0].id }));
  }, [courses.data, cohort.course_id]);

  const batchName = batches.data?.find((b) => b.id === cohort.batch_id)?.label;
  const courseName = courses.data?.find((c) => c.id === cohort.course_id)?.code;
  const centreNames = cohort.centre_ids.map(
    (id) => centres.data?.find((c) => c.id === id)?.name ?? '…',
  );
  const moduleName = modules.data?.find((m) => m.id === moduleId)?.name;
  const students = cohort.centre_ids.reduce(
    (n, centre_id) =>
      n +
      (sizes.data?.get(
        cohortKey({ batch_id: cohort.batch_id, centre_id, course_id: cohort.course_id }),
      ) ?? 0),
    0,
  );
  const length = durationText(Date.parse(schedule.closes) - Date.parse(schedule.opens));
  const whoDone = cohortReady(cohort);
  const missing = [
    !cohort.batch_id && 'the batch',
    !cohort.centre_ids.length && 'a centre',
    !cohort.course_id && 'the course',
    !moduleId && 'the module',
    !length && 'a closing time after the opening time',
  ].filter(Boolean) as string[];

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (missing.length) return toast.error(`Still needed: ${missing.join(', ')}`);
    create.mutate();
  };

  return (
    <form onSubmit={onSubmit} className="card space-y-6 border-brand-300 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold text-stone-900">New feedback session</h2>
        <p className="muted">
          Students get a link and answer anonymously while the session is open.
        </p>
      </div>

      <Step
        n={1}
        done={whoDone}
        title="Who gives feedback?"
        hint="Only students on the roster for this batch, centre and course can open the link."
      >
        <CohortPicker
          me={me}
          value={cohort}
          onChange={(c) => {
            if (c.centre_ids.join() !== cohort.centre_ids.join()) setFaculty([]); // faculty belong to a centre
            if (c.course_id !== cohort.course_id) setModuleId(''); // modules belong to a course
            setCohort(c);
          }}
          multiCentre
        />
        {cohort.centre_ids.length > 1 && (
          <p className="muted">
            Ticking several centres creates one session for each centre, with its own link.
          </p>
        )}
      </Step>

      <Step
        n={2}
        done={!!moduleId}
        title="Which module?"
        hint={
          cohort.course_id
            ? 'The module the students just finished.'
            : 'Choose the course in step 1 first.'
        }
      >
        <Choice
          label="Module"
          value={moduleId}
          onChange={setModuleId}
          isRequired
          isDisabled={!cohort.course_id}
          placeholder={cohort.course_id ? 'Select module' : 'Choose the course first'}
          options={(modules.data ?? [])
            .filter((m) => m.course_id === cohort.course_id)
            .map((m) => ({ value: m.id, label: m.name }))}
        />
        {single ? (
          <FacultyPicker centreId={cohort.centre_ids[0]} value={faculty} onChange={setFaculty} />
        ) : (
          cohort.centre_ids.length > 1 && (
            <p className="muted">
              Faculty are added per centre, on each session's page after it is created.
            </p>
          )
        )}
      </Step>

      <Step
        n={3}
        done={!!length}
        title="When can students answer?"
        hint="Pick a quick option, or set the exact times. You can change them until the session closes."
      >
        <ScheduleFields value={schedule} onChange={setSchedule} />
      </Step>

      <div className="space-y-3 border-t border-stone-200 pt-4">
        {missing.length ? (
          <p className="text-sm text-stone-600">
            <strong className="font-medium text-stone-800">Still needed:</strong>{' '}
            {missing.join(', ')}.
          </p>
        ) : (
          <div className="rounded-lg bg-brand-50 p-3 text-sm text-stone-800">
            <p>
              <strong>{moduleName}</strong> feedback for {courseName} · {batchName} at{' '}
              {centreNames.join(', ')}.
            </p>
            <p className="mt-1">
              Students can answer from {fmt(schedule.opens)} to {fmt(schedule.closes)} ({length}).
            </p>
            {students > 0 ? (
              <p className="mt-1">
                {students} student{students > 1 ? 's' : ''} on the roster will see it.
              </p>
            ) : (
              <p className="mt-2 flex items-start gap-1.5 font-medium text-amber-800">
                <Warning size={16} weight="fill" className="mt-0.5 shrink-0" aria-hidden />
                No students are on the roster for this group yet, so nobody can answer. Upload them
                on the Students page first.
              </p>
            )}
          </div>
        )}
        <div className="flex gap-2">
          <button
            className="btn btn-primary flex-1 py-2.5 font-medium"
            disabled={create.isPending || missing.length > 0}
          >
            {create.isPending
              ? 'Creating…'
              : cohort.centre_ids.length > 1
                ? `Create ${cohort.centre_ids.length} sessions`
                : 'Create session'}
          </button>
          <button type="button" className="btn px-4" onClick={() => onDone()}>
            Cancel
          </button>
        </div>
      </div>
    </form>
  );
}

function Step({
  n,
  title,
  hint,
  done,
  children,
}: {
  n: number;
  title: string;
  hint: string;
  done: boolean;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3" aria-labelledby={`step-${n}`}>
      <div className="flex items-start gap-3">
        <span
          className={`flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${done ? 'bg-brand-700 text-white' : 'bg-stone-200 text-stone-700'}`}
          aria-hidden
        >
          {done ? <CheckCircle size={18} weight="bold" /> : n}
        </span>
        <div>
          <h3 id={`step-${n}`} className="font-semibold text-stone-900">
            {title}
          </h3>
          <p className="muted">{hint}</p>
        </div>
      </div>
      <div className="space-y-3 sm:pl-10">{children}</div>
    </section>
  );
}
