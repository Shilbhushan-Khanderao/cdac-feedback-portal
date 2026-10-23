import { expect, test } from 'vitest';
import { actions, questionScores, scoreTable } from './insights';
import type { DashboardReportRow as Row, SessionInsight } from './api';

const now = Date.parse('2026-10-23T12:00:00Z');
const h = (n: number) => new Date(now + n * 3600000).toISOString();
const row = (p: Partial<Row>): Row => ({
  id: 's',
  batch_id: 'b1',
  centre_id: 'c1',
  course_id: 'k1',
  opens_at: h(-48),
  closes_at: h(48),
  faculty: [],
  batch: 'Aug 2026',
  centre: 'Mumbai',
  course: 'DAC',
  module: 'Java',
  students: 10,
  submitted: 0,
  ratings: null,
  ...p,
});

test('actions: turnout, closing soon, low rating, too few, missing modules', () => {
  const rows = [
    row({ id: 'low-turnout', submitted: 2 }),
    row({ id: 'soon', submitted: 8, closes_at: h(5), module: 'C++' }),
    row({ id: 'fine', submitted: 8, module: 'SQL' }),
    row({
      id: 'low',
      closes_at: h(-24),
      submitted: 5,
      ratings: { Average: 3, Poor: 2 },
      module: 'OS',
    }),
    row({ id: 'ok', closes_at: h(-24), submitted: 5, ratings: { Excellent: 5 }, module: 'Web' }),
    row({ id: 'few', closes_at: h(-24), submitted: 2, module: 'Net' }),
  ];
  const modules = ['Java', 'C++', 'SQL', 'OS', 'Web', 'Net', 'Python'].map((name, i) => ({
    id: `m${i}`,
    name,
    course_id: 'k1',
  }));
  const out = actions(rows, modules, new Set(['b1']), now);
  const keyed = out.map((a) =>
    a.kind === 'missing' ? `missing:${a.module.name}` : `${a.kind}:${a.row.id}`,
  );
  expect(keyed).toEqual([
    'turnout:soon',
    'turnout:low-turnout',
    'low:low',
    'too_few:few',
    'missing:Python',
  ]);
  expect(actions(rows, modules, new Set(), now).some((a) => a.kind === 'missing')).toBe(false);
});

test('questionScores averages rating questions and splits other scales', () => {
  const s = (counts: SessionInsight['counts']): SessionInsight => ({
    session_id: 'x',
    questions: [
      {
        id: 'overall',
        text: 'Overall',
        kind: 'choice',
        options: ['Excellent', 'Very Good', 'Good', 'Average', 'Poor'],
      },
      {
        id: 'pace',
        text: 'Pace',
        kind: 'choice',
        options: ['Very Fast', 'Fast', 'Normal', 'Slow', 'Very Slow'],
      },
      { id: 'lab', text: 'Lab', kind: 'text', options: null },
    ],
    counts,
    comments: {},
  });
  const [overall, pace] = questionScores([
    s({ overall: { Excellent: 2 }, pace: { Normal: 2 } }),
    s({ overall: { Poor: 2 }, pace: { Fast: 1 } }),
  ]);
  expect(overall).toMatchObject({ kind: 'rating', value: 3, answers: 4 });
  expect(pace).toMatchObject({ kind: 'scale', counts: { Normal: 2, Fast: 1 }, answers: 3 });
});

test('scoreTable groups per faculty, best first, with turnout', () => {
  const rows = [
    row({ faculty: ['A', 'B'], ratings: { Excellent: 4 }, submitted: 4, closes_at: h(-1) }),
    row({ faculty: ['B'], ratings: { Poor: 4 }, submitted: 4, students: 4, closes_at: h(-1) }),
  ];
  expect(scoreTable(rows, (r) => r.faculty)).toEqual([
    { name: 'A', value: 5, sessions: 1, answers: 4, turnout: 40 },
    { name: 'B', value: 3, sessions: 2, answers: 8, turnout: 57 },
  ]);
});
