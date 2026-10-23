import { useState, useEffect, useRef, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Warning } from '@phosphor-icons/react';
import { useMe } from '../../app/auth';
import { sessionsApi, type CreateSessionPayload } from '../../shared/sessionsApi';
import {
  cohortKey,
  useBatches,
  useCohortSizes,
  useCourses,
  useModules,
} from '../../shared/reference';
import { CohortPicker, emptyCohort, type Cohort } from '../../shared/CohortPicker';
import { FacultyPicker } from '../../shared/FacultyPicker';
import { presetSchedule, ScheduleFields, type Schedule } from '../../shared/ScheduleFields';
import { Choice } from '../../shared/ui';

interface Props {
  onDone: (created?: { id: string; moduleName?: string }) => void;
}

const DEFAULT_WINDOW = '3 days';

export function CreateSessionForm({ onDone }: Props) {
  const me = useMe();
  const queryClient = useQueryClient();
  const modules = useModules();
  const batches = useBatches();
  const courses = useCourses();
  const sizes = useCohortSizes();
  const formRef = useRef<HTMLFormElement>(null);
  const [cohort, setCohort] = useState<Cohort>(() => emptyCohort(me));
  const [faculty, setFaculty] = useState<string[]>([]);
  const [moduleId, setModuleId] = useState('');
  const [schedule, setSchedule] = useState<Schedule>(() => presetSchedule(DEFAULT_WINDOW));
  // Errors show only after the first attempt to create; before that, empty fields are just highlighted.
  const [tried, setTried] = useState(false);
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

  // Only one active course: take it.
  useEffect(() => {
    const active = courses.data?.filter((c) => c.active) ?? [];
    if (!cohort.course_id && active.length === 1)
      setCohort((c) => ({ ...c, course_id: active[0].id }));
  }, [courses.data, cohort.course_id]);

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

  const students = cohort.centre_ids.reduce(
    (n, centre_id) =>
      n +
      (sizes.data?.get(
        cohortKey({ batch_id: cohort.batch_id, centre_id, course_id: cohort.course_id }),
      ) ?? 0),
    0,
  );
  const errors = {
    batch: !cohort.batch_id ? 'Choose the batch.' : undefined,
    centre: !cohort.centre_ids.length ? 'Tick at least one centre.' : undefined,
    course: !cohort.course_id ? 'Choose the course.' : undefined,
    module: !moduleId ? 'Choose the module.' : undefined,
  };
  const scheduleOk = Date.parse(schedule.closes) > Date.parse(schedule.opens);
  const complete = !Object.values(errors).some(Boolean) && scheduleOk;
  const shown: Partial<typeof errors> = tried ? errors : {};

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (complete) return create.mutate();
    setTried(true);
    // After the error outlines render, bring the first one into view.
    requestAnimationFrame(() =>
      formRef.current
        ?.querySelector('[data-field-error]')
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
    );
  };

  const sessions = cohort.centre_ids.length;
  const ctaLabel = create.isPending
    ? 'Creating…'
    : `Create ${sessions > 1 ? `${sessions} sessions` : 'session'}${students ? ` · ${students} students` : ''}`;

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      noValidate
      className="card space-y-6 border-brand-300 p-5 shadow-md"
    >
      <h2 className="text-lg font-semibold text-stone-900">New feedback session</h2>

      <Section title="Students">
        <CohortPicker
          me={me}
          value={cohort}
          errors={shown}
          onChange={(c) => {
            if (c.centre_ids.join() !== cohort.centre_ids.join()) setFaculty([]); // faculty belong to a centre
            if (c.course_id !== cohort.course_id) setModuleId(''); // modules belong to a course
            setCohort(c);
          }}
          multiCentre
        />
        {sessions > 1 && <p className="muted">Each ticked centre gets its own session and link.</p>}
      </Section>

      <Section title="Module">
        <Choice
          label="Module"
          hideLabel
          value={moduleId}
          onChange={setModuleId}
          isRequired
          error={cohort.course_id ? shown.module : undefined}
          isDisabled={!cohort.course_id}
          placeholder={cohort.course_id ? 'Select module' : 'Choose the course first'}
          options={(modules.data ?? [])
            .filter((m) => m.course_id === cohort.course_id)
            .map((m) => ({ value: m.id, label: m.name }))}
        />
        {single ? (
          <FacultyPicker centreId={cohort.centre_ids[0]} value={faculty} onChange={setFaculty} />
        ) : (
          sessions > 1 && (
            <p className="muted">Add faculty on each session's page after creating.</p>
          )
        )}
      </Section>

      <Section title="Open for">
        <ScheduleFields value={schedule} onChange={setSchedule} initial={DEFAULT_WINDOW} />
      </Section>

      {complete && students === 0 && (
        <p className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <Warning size={18} weight="fill" className="mt-0.5 shrink-0 text-amber-600" aria-hidden />
          No students are on the roster for this group yet, so nobody could answer. Upload them on
          the Students page first.
        </p>
      )}

      {/* On phones the main action stays in reach at the bottom of the screen. */}
      <div className="flex gap-2 max-sm:sticky max-sm:bottom-0 max-sm:-mx-5 max-sm:border-t max-sm:border-stone-200 max-sm:bg-white/95 max-sm:px-5 max-sm:py-3 max-sm:backdrop-blur">
        <button
          className="btn btn-primary min-h-12 flex-1 text-base max-sm:text-sm"
          disabled={create.isPending}
        >
          {ctaLabel}
        </button>
        <button type="button" className="btn min-h-12 px-4" onClick={() => onDone()}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 border-t border-stone-100 pt-5 first-of-type:border-0 first-of-type:pt-0">
      <h3 className="text-base font-semibold text-stone-900">{title}</h3>
      {children}
    </section>
  );
}
