import { useState, useEffect, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useMe } from '../../app/auth';
import { sessionsApi, type CreateSessionPayload } from '../../shared/sessionsApi';
import { useBatches, useModules } from '../../shared/reference';
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

  // Auto pre-fill batch if not set
  useEffect(() => {
    if (!cohort.batch_id && batches.data?.length) {
      const active = batches.data.find((b) => b.active) ?? batches.data[0];
      if (active) {
        setCohort((c) => ({ ...c, batch_id: active.id }));
      }
    }
  }, [batches.data, cohort.batch_id]);

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

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!cohortReady(cohort)) return toast.error('Pick batch, centre and course');
    if (!moduleId) return toast.error('Pick a module');
    if (Date.parse(schedule.closes) <= Date.parse(schedule.opens))
      return toast.error('Closes must be after Opens');
    create.mutate();
  };

  return (
    <form onSubmit={onSubmit} className="card space-y-4 border-brand-300 shadow-sm">
      <div className="border-b pb-2">
        <h2 className="card-title">Create Feedback Session</h2>
        <p className="text-xs text-stone-500">
          Cohort parameters are pre-filled based on your coordinator profile.
        </p>
      </div>

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
      <Choice
        label="Module"
        value={moduleId}
        onChange={setModuleId}
        isRequired
        isDisabled={!cohort.course_id}
        placeholder={cohort.course_id ? 'Select module' : 'Pick a course first'}
        options={(modules.data ?? [])
          .filter((m) => m.course_id === cohort.course_id)
          .map((m) => ({ value: m.id, label: m.name }))}
      />
      <ScheduleFields value={schedule} onChange={setSchedule} />
      {single ? (
        <FacultyPicker centreId={cohort.centre_ids[0]} value={faculty} onChange={setFaculty} />
      ) : (
        cohort.centre_ids.length > 1 && (
          <p className="muted">
            One session per centre will be created. Each centre’s CC adds its faculty on the session
            page.
          </p>
        )
      )}
      <div className="flex gap-2 pt-2">
        <button className="btn btn-primary flex-1 py-2.5 font-medium" disabled={create.isPending}>
          {create.isPending ? 'Creating…' : 'Create & Get Student Link'}
        </button>
        <button type="button" className="btn px-4" onClick={() => onDone()}>
          Cancel
        </button>
      </div>
    </form>
  );
}
