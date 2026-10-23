import { useMemo, useState, type ReactNode } from 'react';
import { analyze } from '../reports/CommentAnalysis';
import {
  FEW_RESPONSES,
  LOW_RATING,
  pct,
  total,
  type QuestionScore,
  type ScoreRow,
} from './insights';

export function Panel({
  id,
  title,
  sub,
  children,
}: {
  id?: string;
  title: string;
  sub?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="card scroll-mt-24">
      <h2 className="text-base font-semibold text-stone-900">{title}</h2>
      {sub && <p className="muted mb-4">{sub}</p>}
      {children}
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="muted py-6 text-center">{children}</p>;
}

const scoreTone = (v: number) =>
  v < LOW_RATING ? 'bg-red-600' : v < 4 ? 'bg-amber-500' : 'bg-brand-600';

/** One bar per rating question, weakest called out; other scales (pace) as a split bar. */
export function QuestionAreas({ scores }: { scores: QuestionScore[] }) {
  const ratings = scores.filter((s) => s.kind === 'rating');
  const scales = scores.filter((s) => s.kind === 'scale');
  if (!scores.length)
    return <Empty>Appears after the first session closes with at least 3 answers.</Empty>;
  const weakest = [...ratings].sort((a, b) => a.value - b.value)[0];
  return (
    <div className="space-y-5">
      {weakest && ratings.length > 1 && (
        <p
          className={`rounded-lg p-3 text-sm ${weakest.value < LOW_RATING ? 'bg-red-50 text-red-900' : 'bg-amber-50 text-amber-900'}`}
        >
          Weakest area: <strong>{weakest.text}</strong>, {weakest.value} / 5.
        </p>
      )}
      <ul className="space-y-3">
        {ratings.map((s) => (
          <li key={s.id}>
            <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
              <span className="font-medium text-stone-800">{s.text}</span>
              <span className="num font-semibold text-stone-900">
                {s.value} <span className="font-normal text-stone-500">/ 5</span>
              </span>
            </div>
            <div
              className="h-2.5 rounded-full bg-stone-100"
              role="img"
              aria-label={`${s.text}: ${s.value} out of 5`}
            >
              <div
                className={`h-full rounded-full ${scoreTone(s.value)}`}
                style={{ width: `${(s.value / 5) * 100}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
      {scales.map((s) => (
        <Split key={s.id} title={s.text} options={s.options} counts={s.counts} />
      ))}
    </div>
  );
}

/** Answer split for a non-rating scale; the middle option is the ideal (e.g. pace "Normal"). */
function Split({
  title,
  options,
  counts,
}: {
  title: string;
  options: string[];
  counts: Record<string, number>;
}) {
  const n = total(counts);
  const mid = Math.floor(options.length / 2);
  const colour = (i: number) =>
    i === mid ? 'bg-brand-600' : Math.abs(i - mid) === 1 ? 'bg-amber-400' : 'bg-red-500';
  return (
    <div>
      <p className="mb-1 text-sm font-medium text-stone-800">
        {title}:{' '}
        <span className="font-normal text-stone-600">
          {pct(counts[options[mid]] ?? 0, n)}% said {options[mid]}
        </span>
      </p>
      <div
        className="flex h-2.5 gap-0.5 overflow-hidden rounded-full"
        role="img"
        aria-label={options.map((o) => `${o} ${pct(counts[o] ?? 0, n)}%`).join(', ')}
      >
        {options.map((o, i) =>
          counts[o] ? (
            <div key={o} className={colour(i)} style={{ width: `${(100 * counts[o]) / n}%` }} />
          ) : null,
        )}
      </div>
      <ul className="mt-1.5 flex flex-wrap gap-x-3 text-xs text-stone-600">
        {options.map((o) => (
          <li key={o}>
            {o} {pct(counts[o] ?? 0, n)}%
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Score table: name, score, sessions, turnout. Low and thin results are labelled, not hidden. */
export function ScoreTable({ rows, label }: { rows: ScoreRow[]; label: string }) {
  if (!rows.length) return <Empty>No results yet for this selection.</Empty>;
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-xs uppercase tracking-wide text-stone-500">
        <tr>
          <th className="pb-2 font-semibold">{label}</th>
          <th className="pb-2 text-right font-semibold">Score</th>
          <th className="hidden pb-2 text-right font-semibold sm:table-cell">Sessions</th>
          <th className="pb-2 text-right font-semibold">Turnout</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-stone-100">
        {rows.map((r) => (
          <tr key={r.name}>
            <td className="py-2.5 pr-2">
              <span className="font-medium text-stone-900">{r.name}</span>
              {r.value < LOW_RATING && (
                <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-xs font-semibold text-red-700">
                  Low
                </span>
              )}
              {r.answers < FEW_RESPONSES && (
                <span className="ml-2 text-xs text-stone-500">few answers</span>
              )}
            </td>
            <td className="num py-2.5 text-right">
              <span className="inline-flex items-center gap-1.5 font-semibold text-stone-900">
                <span className={`size-2 rounded-full ${scoreTone(r.value)}`} aria-hidden />
                {r.value}
              </span>
            </td>
            <td className="num hidden py-2.5 text-right text-stone-600 sm:table-cell">
              {r.sessions}
            </td>
            <td className="num py-2.5 text-right text-stone-600">{r.turnout}%</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const SAMPLE = 4;

/** Tone, recurring phrases and a few comments per text question, across the filtered sessions. */
export function StudentVoice({ groups }: { groups: { title: string; items: string[] }[] }) {
  const withText = groups.filter((g) => g.items.length);
  if (!withText.length) return <Empty>No written comments yet for this selection.</Empty>;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {withText.map((g) => (
        <VoiceGroup key={g.title} title={g.title} items={g.items} />
      ))}
    </div>
  );
}

function VoiceGroup({ title, items }: { title: string; items: string[] }) {
  const a = useMemo(() => analyze(items), [items]);
  // Identical comments are shown once with a count, so one repeated line doesn't fill the list.
  const unique = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of items) m.set(c.trim(), (m.get(c.trim()) ?? 0) + 1);
    return [...m.entries()];
  }, [items]);
  const [more, setMore] = useState(false);
  const [pos, neu, neg] = a.tone;
  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-stone-900">
        {title} <span className="font-normal text-stone-500">· {items.length} comments</span>
      </h3>
      <div
        className="flex h-2.5 gap-0.5 overflow-hidden rounded-full"
        role="img"
        aria-label={`Positive ${pos.count}, neutral ${neu.count}, negative ${neg.count}`}
      >
        {a.tone.map((t) =>
          t.count ? (
            <div
              key={t.label}
              style={{ width: `${(100 * t.count) / items.length}%`, background: t.color }}
            />
          ) : null,
        )}
      </div>
      <p className="text-xs text-stone-600">
        {pct(pos.count, items.length)}% positive · {pct(neu.count, items.length)}% neutral ·{' '}
        {pct(neg.count, items.length)}% negative
      </p>
      {a.phrases.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Most mentioned">
          {a.phrases.slice(0, 8).map((p) => (
            <li
              key={p.term}
              className="rounded-full bg-stone-100 px-2.5 py-1 text-xs text-stone-700"
            >
              {p.term} <span className="font-semibold">{p.count}</span>
            </li>
          ))}
        </ul>
      )}
      <ul className="space-y-2">
        {(more ? unique : unique.slice(0, SAMPLE)).map(([c, n]) => (
          <li
            key={c}
            className="rounded-lg border-l-4 border-stone-300 bg-stone-50 px-3 py-2 text-sm text-stone-800"
          >
            {c}
            {n > 1 && <span className="ml-2 text-xs font-semibold text-stone-500">×{n}</span>}
          </li>
        ))}
      </ul>
      {unique.length > SAMPLE && (
        <button
          className="text-sm font-medium text-brand-700 hover:underline"
          onClick={() => setMore((v) => !v)}
        >
          {more ? 'Show fewer' : `Show all ${unique.length} comments`}
        </button>
      )}
    </div>
  );
}
