import { useState } from 'react';
import { DateTimeField } from './ui';
import { durationText, fmt } from './format';

export type Schedule = { opens: string; closes: string };

const HOUR = 3600000;
const endOfToday = () => {
  const d = new Date();
  d.setHours(23, 59, 0, 0);
  return d.getTime();
};
// Minute precision: the date fields show minutes, so seconds would only confuse comparisons.
const at = (t: number) => new Date(Math.floor(t / 60000) * 60000).toISOString();

const PRESETS: { label: string; closes: (now: number) => number }[] = [
  { label: '1 hour', closes: (now) => now + HOUR },
  { label: '2 hours', closes: (now) => now + 2 * HOUR },
  { label: 'Until end of day', closes: endOfToday },
  { label: '3 days', closes: (now) => now + 72 * HOUR },
];
const CUSTOM = 'Custom';

/** A window of the given preset's length, starting now. */
export function presetSchedule(preset: string): Schedule {
  const now = Date.now();
  const p = PRESETS.find((x) => x.label === preset) ?? PRESETS[3];
  return { opens: at(now), closes: at(p.closes(now)) };
}

/**
 * How long students can answer: a one-tap window starting now, or Custom for exact times.
 * `initial` is the preset already applied to `value`; leave it out when `value` is a saved schedule.
 */
export function ScheduleFields({
  value,
  onChange,
  initial = CUSTOM,
  closeNow,
}: {
  value: Schedule;
  onChange: (s: Schedule) => void;
  initial?: string;
  closeNow?: boolean;
}) {
  const [choice, setChoice] = useState(initial);
  const length = durationText(Date.parse(value.closes) - Date.parse(value.opens));
  const pick = (label: string) => {
    setChoice(label);
    if (label !== CUSTOM) onChange(presetSchedule(label));
  };

  return (
    <div className="space-y-3" data-field-error={length ? undefined : ''}>
      <div className="flex flex-wrap gap-2">
        <div
          role="group"
          aria-label="Open now for"
          className="inline-flex flex-wrap gap-1 rounded-lg border border-stone-300 bg-white p-1"
        >
          {[...PRESETS.map((p) => p.label), CUSTOM].map((label) => (
            <button
              key={label}
              type="button"
              aria-pressed={choice === label}
              onClick={() => pick(label)}
              className={`min-h-9 rounded-md px-3 text-sm font-medium transition-colors ${
                choice === label
                  ? 'bg-brand-700 text-white shadow-sm'
                  : 'text-stone-700 hover:bg-stone-100'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {closeNow && (
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => onChange({ ...value, closes: at(Date.now()) })}
          >
            Close now
          </button>
        )}
      </div>

      {choice === CUSTOM && (
        <div className="grid gap-4 sm:grid-cols-2">
          <DateTimeField
            label="Opens"
            value={value.opens}
            onChange={(opens) => onChange({ ...value, opens })}
          />
          <DateTimeField
            label="Closes"
            value={value.closes}
            onChange={(closes) => onChange({ ...value, closes })}
          />
        </div>
      )}

      {length ? (
        <p className="text-sm text-stone-700">
          Students can answer from <strong className="font-semibold">{fmt(value.opens)}</strong> to{' '}
          <strong className="font-semibold">{fmt(value.closes)}</strong> ({length}).
        </p>
      ) : (
        <p className="field-error">The closing time must be after the opening time.</p>
      )}
    </div>
  );
}
