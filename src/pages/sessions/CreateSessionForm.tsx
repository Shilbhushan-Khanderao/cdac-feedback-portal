import { useState, useEffect, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useMe } from '../../auth';
import { api, type CreateSessionPayload } from '../../lib/api';
import { toLocalInput } from '../../lib/format';
import { useBatches, useModules } from '../../lib/reference';
import { CohortPicker, cohortReady, emptyCohort, type Cohort } from '../CohortPicker';
import { FacultyPicker } from '../FacultyPicker';

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
    mutationFn: (form: FormData) => {
      const moduleId = form.get('module') as string;
      const payload: CreateSessionPayload[] = cohort.centre_ids.map((centre_id) => ({
        batch_id: cohort.batch_id,
        centre_id,
        course_id: cohort.course_id,
        module_id: moduleId,
        faculty: single ? faculty : [],
        opens_at: new Date(form.get('opens') as string).toISOString(),
        closes_at: new Date(form.get('closes') as string).toISOString(),
      }));
      return api.sessions.create(payload);
    },
    onSuccess: (data, form) => {
      const moduleId = form.get('module') as string;
      const mod = modules.data?.find((m) => m.id === moduleId);
      const first = Array.isArray(data) ? data[0] : data;
      toast.success(single ? 'Session created!' : `${cohort.centre_ids.length} sessions created.`);
      void queryClient.invalidateQueries({ queryKey: ['sessions'] });
      onDone(first?.id ? { id: first.id, moduleName: mod?.name } : undefined);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!cohortReady(cohort)) return toast.error('Pick batch, centre and course');
    create.mutate(new FormData(e.currentTarget));
  };

  return (
    <form onSubmit={onSubmit} className="card space-y-4 border-brand-300 shadow-sm">
      <div className="border-b pb-2">
        <h2 className="card-title">Create Feedback Session</h2>
        <p className="text-xs text-stone-500">Cohort parameters are pre-filled based on your coordinator profile.</p>
      </div>

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
          <label className="label font-medium" htmlFor="module">Module</label>
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
          <label className="label font-medium" htmlFor="opens">Opens</label>
          <input id="opens" name="opens" type="datetime-local" className="input" required defaultValue={toLocalInput(new Date())} />
        </div>
        <div>
          <label className="label font-medium" htmlFor="closes">Closes</label>
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
