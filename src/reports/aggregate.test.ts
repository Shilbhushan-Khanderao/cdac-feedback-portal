import { expect, test } from 'vitest';
import { aggregate, toCsv, type Question } from './aggregate';

const questions: Question[] = [
  { id: 'overall', text: 'Overall rating', kind: 'choice', options: ['Excellent', 'Good', 'Poor'] },
  { id: 'theory', text: 'Theory comments', kind: 'text', options: [] },
];
const answers = [
  { overall: 'Good', theory: ' Great sessions ' },
  { overall: 'Good', theory: 'N/A' },
  { overall: 'Excellent', theory: '' },
  { overall: 'Excellent' },
  { overall: 'Good', theory: 'More labs please' },
];

test('counts choices in option order, drops zero slices', () => {
  const r = aggregate(questions, answers);
  expect(r.total).toBe(5);
  expect(r.charts).toEqual([
    { title: 'Overall rating', data: [{ feedback: 'Excellent', count: 2 }, { feedback: 'Good', count: 3 }] },
  ]);
});

test('trims comments and filters noise', () => {
  expect(aggregate(questions, answers).comments[0].items).toEqual(['Great sessions', 'More labs please']);
});

test('csv keeps question text headers', () => {
  expect(toCsv(questions, answers.slice(0, 1))).toBe('Overall rating,Theory comments\r\nGood," Great sessions "');
});
