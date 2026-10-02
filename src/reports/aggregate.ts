import Papa from 'papaparse';

export type Question = { id: string; text: string; kind: 'choice' | 'text'; options: string[] };
export type Answers = Record<string, string | null | undefined>;
export type Slice = { feedback: string; count: number };

// Comments that carry no information (from the v1 csvConfig noise filters).
const NOISE = new Set(['na', 'n/a', 'none', 'nil', 'nothing', 'no comment', 'no comments', 'no', 'null',
  '.', 'na.', 'n.a.', '-', '--', '..']);

export function aggregate(questions: Question[], answers: Answers[]) {
  return {
    total: answers.length,
    charts: questions
      .filter((q) => q.kind === 'choice')
      .map((q) => ({
        title: q.text,
        data: q.options
          .map((o) => ({ feedback: o, count: answers.filter((a) => a[q.id] === o).length }))
          .filter((s) => s.count > 0),
      })),
    comments: questions
      .filter((q) => q.kind === 'text')
      .map((q) => ({
        title: q.text,
        items: answers.map((a) => a[q.id]?.trim() ?? '').filter((c) => c && !NOISE.has(c.toLowerCase())),
      })),
  };
}

/** Same shape as the v1 Google-Form CSV: one column per question, one row per response. */
export const toCsv = (questions: Question[], answers: Answers[]) =>
  Papa.unparse({ fields: questions.map((q) => q.text), data: answers.map((a) => questions.map((q) => a[q.id] ?? '')) });
