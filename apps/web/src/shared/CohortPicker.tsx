import { useBatches, useCentres, useCourses } from './reference';
import { Choice } from './ui';

/** The slice of the signed-in user that locks centre/course for a CC. */
type Scope = { role: string; centre_id?: string | null; course_id?: string | null };

/** A cohort = shared batch + centre(s) + course. */
export type Cohort = { batch_id: string; centre_ids: string[]; course_id: string };

export const emptyCohort = (me: Scope): Cohort => ({
  batch_id: '',
  centre_ids: me.role === 'cc' && me.centre_id ? [me.centre_id] : [],
  course_id: me.course_id ?? '',
});

export const cohortReady = (c: Cohort) => !!(c.batch_id && c.centre_ids.length && c.course_id);

/**
 * Batch, centre and course selects. A CC's centre (and course, if fixed) is locked.
 * multiCentre lets an admin tick several centres (one session is created per centre).
 */
export function CohortPicker({
  me,
  value,
  onChange,
  multiCentre = false,
}: {
  me: Scope;
  value: Cohort;
  onChange: (c: Cohort) => void;
  multiCentre?: boolean;
}) {
  const batches = useBatches();
  const centres = useCentres();
  const courses = useCourses();
  const set = (patch: Partial<Cohort>) => onChange({ ...value, ...patch });
  const centreName = (id: string) => centres.data?.find((c) => c.id === id)?.name ?? '…';

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Choice
        label="Batch"
        value={value.batch_id}
        onChange={(batch_id) => set({ batch_id })}
        isRequired
        placeholder="Select batch"
        options={(batches.data ?? [])
          .filter((b) => b.active || b.id === value.batch_id)
          .map((b) => ({ value: b.id, label: b.label }))}
      />

      <div>
        <span className="label" id="cohort-centre-label">
          Centre
        </span>
        {me.role === 'cc' ? (
          <p className="input bg-stone-50" aria-labelledby="cohort-centre-label">
            {centreName(me.centre_id!)}
          </p>
        ) : multiCentre ? (
          <div
            className="space-y-1 rounded-lg border border-stone-300 p-2"
            role="group"
            aria-labelledby="cohort-centre-label"
          >
            {centres.data?.map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={value.centre_ids.includes(c.id)}
                  onChange={(e) =>
                    set({
                      centre_ids: e.target.checked
                        ? [...value.centre_ids, c.id]
                        : value.centre_ids.filter((x) => x !== c.id),
                    })
                  }
                />
                {c.name}
              </label>
            ))}
          </div>
        ) : (
          <Choice
            label="Centre"
            hideLabel
            value={value.centre_ids[0] ?? ''}
            onChange={(id) => set({ centre_ids: id ? [id] : [] })}
            isRequired
            placeholder="Select centre"
            options={(centres.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
          />
        )}
      </div>

      <Choice
        label="Course"
        value={value.course_id}
        onChange={(course_id) => set({ course_id })}
        isRequired
        isDisabled={!!me.course_id}
        placeholder="Select course"
        options={(courses.data ?? [])
          .filter((c) => c.active || c.id === value.course_id)
          .map((c) => ({ value: c.id, label: c.code }))}
      />
    </div>
  );
}
