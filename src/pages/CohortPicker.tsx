import { useMe, type Me } from '../auth';
import { useBatches, useCentres, useCourses } from '../lib/reference';

/** A cohort = shared batch + centre(s) + course. */
export type Cohort = { batch_id: string; centre_ids: string[]; course_id: string };

export const emptyCohort = (me: Me): Cohort => ({
  batch_id: '',
  centre_ids: me.role === 'cc' && me.centre_id ? [me.centre_id] : [],
  course_id: me.course_id ?? '',
});

export const cohortReady = (c: Cohort) => !!(c.batch_id && c.centre_ids.length && c.course_id);

/**
 * Batch, centre and course selects. A CC's centre (and course, if fixed) is locked.
 * multiCentre lets an admin tick several centres (one session is created per centre).
 */
export function CohortPicker({ value, onChange, multiCentre = false }: { value: Cohort; onChange: (c: Cohort) => void; multiCentre?: boolean }) {
  const me = useMe();
  const batches = useBatches();
  const centres = useCentres();
  const courses = useCourses();
  const set = (patch: Partial<Cohort>) => onChange({ ...value, ...patch });
  const centreName = (id: string) => centres.data?.find((c) => c.id === id)?.name ?? '…';

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <div>
        <label className="label" htmlFor="cohort-batch">Batch</label>
        <select id="cohort-batch" className="input" required value={value.batch_id} onChange={(e) => set({ batch_id: e.target.value })}>
          <option value="">Select batch</option>
          {batches.data?.filter((b) => b.active).map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <span className="label" id="cohort-centre-label">Centre</span>
        {me.role === 'cc' ? (
          <p className="input bg-slate-50" aria-labelledby="cohort-centre-label">{centreName(me.centre_id!)}</p>
        ) : multiCentre ? (
          <div className="space-y-1 rounded-lg border border-slate-300 p-2" role="group" aria-labelledby="cohort-centre-label">
            {centres.data?.map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={value.centre_ids.includes(c.id)}
                  onChange={(e) =>
                    set({ centre_ids: e.target.checked ? [...value.centre_ids, c.id] : value.centre_ids.filter((x) => x !== c.id) })
                  }
                />
                {c.name}
              </label>
            ))}
          </div>
        ) : (
          <select
            className="input"
            aria-labelledby="cohort-centre-label"
            required
            value={value.centre_ids[0] ?? ''}
            onChange={(e) => set({ centre_ids: e.target.value ? [e.target.value] : [] })}
          >
            <option value="">Select centre</option>
            {centres.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <div>
        <label className="label" htmlFor="cohort-course">Course</label>
        <select
          id="cohort-course"
          className="input disabled:bg-slate-50"
          required
          disabled={!!me.course_id}
          value={value.course_id}
          onChange={(e) => set({ course_id: e.target.value })}
        >
          <option value="">Select course</option>
          {courses.data?.filter((c) => c.active || c.id === value.course_id).map((c) => (
            <option key={c.id} value={c.id}>
              {c.code}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
