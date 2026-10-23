import { sessionStatus } from '../../shared/format';
import { RATING_SCORE } from '../../shared/palette';
import type { DashboardReportRow as Row, SessionInsight } from './api';

/** Average rating below this (out of 5) is flagged as low. */
export const LOW_RATING = 3;
/** Fewer total answers than this and a score is marked "few responses". */
export const FEW_RESPONSES = 10;
const DAY = 86400000;

export const total = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);
export const round1 = (n: number) => Math.round(n * 10) / 10;
export const pct = (a: number, b: number) => (b ? Math.round((100 * a) / b) : 0);

/** Mean on the Excellent(5)..Poor(1) scale; words outside the scale are ignored. */
export function mean(r: Record<string, number>) {
  let n = 0;
  let sum = 0;
  for (const [k, v] of Object.entries(r)) {
    if (!RATING_SCORE[k]) continue;
    n += v;
    sum += RATING_SCORE[k] * v;
  }
  return n ? sum / n : 0;
}

export function merge(list: (Record<string, number> | null | undefined)[]) {
  const acc: Record<string, number> = {};
  for (const r of list) for (const [k, v] of Object.entries(r ?? {})) acc[k] = (acc[k] ?? 0) + v;
  return acc;
}

export function group<T>(items: T[], key: (t: T) => string): [string, T[]][] {
  const m = new Map<string, T[]>();
  for (const i of items) m.set(key(i), [...(m.get(key(i)) ?? []), i]);
  return [...m.entries()];
}

export type QuestionScore =
  | { id: string; text: string; kind: 'rating'; value: number; answers: number }
  | {
      id: string;
      text: string;
      kind: 'scale';
      options: string[];
      counts: Record<string, number>;
      answers: number;
    };

/**
 * One entry per choice question across the given sessions: an average for Excellent..Poor
 * questions, the answer split for other scales (e.g. pace: Very Fast..Very Slow).
 */
export function questionScores(insights: SessionInsight[]): QuestionScore[] {
  const byId = new Map<
    string,
    { text: string; options: string[]; counts: Record<string, number>[] }
  >();
  for (const s of insights)
    for (const q of s.questions) {
      if (q.kind !== 'choice') continue;
      const e = byId.get(q.id) ?? { text: q.text, options: q.options ?? [], counts: [] };
      e.counts.push(s.counts[q.id] ?? {});
      byId.set(q.id, e);
    }
  return [...byId.entries()].map(([id, e]) => {
    const counts = merge(e.counts);
    return e.options.includes('Excellent')
      ? {
          id,
          text: e.text,
          kind: 'rating' as const,
          value: round1(mean(counts)),
          answers: total(counts),
        }
      : {
          id,
          text: e.text,
          kind: 'scale' as const,
          options: e.options,
          counts,
          answers: total(counts),
        };
  });
}

/** Comments per text question across the given sessions (already in random order per session). */
export function commentsByQuestion(insights: SessionInsight[]) {
  const byId = new Map<string, { title: string; items: string[] }>();
  for (const s of insights)
    for (const q of s.questions) {
      if (q.kind !== 'text') continue;
      const e = byId.get(q.id) ?? { title: q.text, items: [] };
      e.items.push(...(s.comments[q.id] ?? []));
      byId.set(q.id, e);
    }
  return [...byId.values()];
}

export type ScoreRow = {
  name: string;
  value: number;
  sessions: number;
  answers: number;
  turnout: number;
};

/** Average rating, session count and turnout per group, best first; only sessions with results. */
export function scoreTable(rows: Row[], key: (r: Row) => string[]): ScoreRow[] {
  const pairs = rows.filter((r) => r.ratings).flatMap((r) => key(r).map((k) => ({ k, r })));
  return group(pairs, (p) => p.k)
    .map(([name, g]) => {
      const counts = merge(g.map((p) => p.r.ratings));
      return {
        name,
        value: round1(mean(counts)),
        sessions: g.length,
        answers: total(counts),
        turnout: pct(
          g.reduce((a, p) => a + p.r.submitted, 0),
          g.reduce((a, p) => a + p.r.students, 0),
        ),
      };
    })
    .sort((a, b) => b.value - a.value);
}

export type Missing = {
  module: { id: string; name: string };
  batch_id: string;
  batch: string;
  centre_id: string;
  centre: string;
  course_id: string;
  course: string;
};
export type Action =
  | { kind: 'turnout'; row: Row; closesSoon: boolean }
  | { kind: 'low'; row: Row; value: number }
  | { kind: 'too_few'; row: Row }
  | ({ kind: 'missing' } & Missing);

/**
 * What a coordinator should do next, most urgent first: open sessions with under half
 * responding (or closing within a day, soonest first), then low ratings and too-few-responses on
 * sessions closed in the last 30 days, then modules of an active batch that have no session yet.
 */
export function actions(
  rows: Row[],
  modules: { id: string; name: string; course_id: string; active?: boolean }[],
  activeBatchIds: Set<string>,
  now = Date.now(),
): Action[] {
  const out: Exclude<Action, { kind: 'missing' }>[] = [];
  for (const r of rows) {
    const status = sessionStatus(r, now);
    if (status === 'open' && r.students > 0 && r.submitted < r.students) {
      const closesSoon = Date.parse(r.closes_at) - now < DAY;
      if (closesSoon || r.submitted / r.students < 0.5)
        out.push({ kind: 'turnout', row: r, closesSoon });
    } else if (status === 'closed' && now - Date.parse(r.closes_at) < 30 * DAY) {
      if (!r.ratings) out.push({ kind: 'too_few', row: r });
      else if (mean(r.ratings) < LOW_RATING)
        out.push({ kind: 'low', row: r, value: round1(mean(r.ratings)) });
    }
  }
  // Open sessions first (they can still be fixed), then low ratings, then hidden results.
  const rank = { turnout: 0, low: 1, too_few: 2 };
  out.sort(
    (a, b) =>
      rank[a.kind] - rank[b.kind] || Date.parse(a.row.closes_at) - Date.parse(b.row.closes_at),
  );
  const missing: Action[] = [];

  // Cohorts seen in the data, active batches only; a module is covered by any session for it.
  const cohorts = new Map<string, Row>();
  for (const r of rows)
    if (r.batch_id && activeBatchIds.has(r.batch_id))
      cohorts.set(`${r.batch_id}|${r.centre_id}|${r.course_id}`, r);
  for (const c of cohorts.values()) {
    const covered = new Set(
      rows
        .filter(
          (r) =>
            r.batch_id === c.batch_id && r.centre_id === c.centre_id && r.course_id === c.course_id,
        )
        .map((r) => r.module),
    );
    for (const m of modules)
      if (m.course_id === c.course_id && m.active !== false && !covered.has(m.name))
        missing.push({
          kind: 'missing',
          module: { id: m.id, name: m.name },
          batch_id: c.batch_id!,
          batch: c.batch,
          centre_id: c.centre_id!,
          centre: c.centre,
          course_id: c.course_id!,
          course: c.course,
        });
  }
  return [...out, ...missing];
}
