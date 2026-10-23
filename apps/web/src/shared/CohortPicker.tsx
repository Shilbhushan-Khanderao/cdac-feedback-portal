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

export type CohortErrors = Partial<Record<'batch' | 'centre' | 'course', string>>;

/**
 * Batch, centre and course. A CC's fixed centre (and course, if assigned) show as chips, not
 * inputs. multiCentre lets an admin tick several centres (one session is created per centre).
 */
export function CohortPicker({
  me,
  value,
  onChange,
  multiCentre = false,
  errors = {},
}: {
  me: Scope;
  value: Cohort;
  onChange: (c: Cohort) => void;
  multiCentre?: boolean;
  errors?: CohortErrors;
}) {
  const batches = useBatches();
  const centres = useCentres();
  const courses = useCourses();
  const set = (patch: Partial<Cohort>) => onChange({ ...value, ...patch });
  const centreName = (id: string) => centres.data?.find((c) => c.id === id)?.name ?? '…';
  const courseOptions = (courses.data ?? [])
    .filter((c) => c.active || c.id === value.course_id)
    .map((c) => ({ value: c.id, label: c.code }));
  const isCc = me.role === 'cc';

  const batch = (
    <Choice
      label="Batch"
      value={value.batch_id}
      onChange={(batch_id) => set({ batch_id })}
      isRequired
      error={errors.batch}
      placeholder="Select batch"
      options={(batches.data ?? [])
        .filter((b) => b.active || b.id === value.batch_id)
        .map((b) => ({ value: b.id, label: b.label }))}
    />
  );
  const course = (
    <Choice
      label="Course"
      value={value.course_id}
      onChange={(course_id) => set({ course_id })}
      isRequired
      error={errors.course}
      placeholder="Select course"
      options={courseOptions}
    />
  );

  if (isCc) {
    const courseCode = courses.data?.find((c) => c.id === me.course_id)?.code ?? '…';
    return (
      <div className="space-y-4">
        <p className="flex flex-wrap items-center gap-2 text-sm text-stone-700">
          Your students at
          <span className="chip">{centreName(me.centre_id!)}</span>
          {me.course_id && (
            <>
              in <span className="chip">{courseCode}</span>
            </>
          )}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {batch}
          {!me.course_id && course}
        </div>
      </div>
    );
  }

  const centreState = errors.centre
    ? 'border-red-500 bg-red-50/50 ring-2 ring-red-100'
    : value.centre_ids.length
      ? 'border-stone-300'
      : 'border-brand-500 bg-brand-50/60 ring-1 ring-brand-500/25';

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {batch}
      {multiCentre ? (
        <div data-field-error={errors.centre ? '' : undefined}>
          <span className="label" id="cohort-centre-label">
            Centres
          </span>
          <div
            className={`space-y-1 rounded-lg border p-2 ${centreState}`}
            role="group"
            aria-labelledby="cohort-centre-label"
          >
            {centres.data?.map((c) => (
              <label key={c.id} className="flex min-h-8 items-center gap-2 text-sm text-stone-800">
                <input
                  type="checkbox"
                  className="size-4 accent-brand-700"
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
          {errors.centre && <p className="field-error">{errors.centre}</p>}
        </div>
      ) : (
        <Choice
          label="Centre"
          value={value.centre_ids[0] ?? ''}
          onChange={(id) => set({ centre_ids: id ? [id] : [] })}
          isRequired
          error={errors.centre}
          placeholder="Select centre"
          options={(centres.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
        />
      )}
      {course}
    </div>
  );
}
