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

/** Opens/closes pickers, one-tap windows starting now, and a plain-language check of the result. */
export function ScheduleFields({
  value,
  onChange,
  closeNow,
}: {
  value: Schedule;
  onChange: (s: Schedule) => void;
  closeNow?: boolean;
}) {
  const length = durationText(Date.parse(value.closes) - Date.parse(value.opens));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-stone-600">Open now for:</span>
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            className="btn min-h-9 rounded-full px-3 py-1 text-xs"
            onClick={() => {
              const now = Date.now();
              onChange({ opens: at(now), closes: at(p.closes(now)) });
            }}
          >
            {p.label}
          </button>
        ))}
        {closeNow && (
          <button
            type="button"
            className="btn btn-danger min-h-9 rounded-full px-3 py-1 text-xs"
            onClick={() => onChange({ ...value, closes: at(Date.now()) })}
          >
            Close now
          </button>
        )}
      </div>
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
      <p
        role="status"
        className={`text-sm ${length ? 'text-stone-600' : 'font-medium text-red-700'}`}
      >
        {length
          ? `Open ${fmt(value.opens)} to ${fmt(value.closes)} (${length}).`
          : 'Closes must be after Opens.'}
      </p>
    </div>
  );
}
