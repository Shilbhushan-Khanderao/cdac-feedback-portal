import { expect, test } from 'vitest';
import { durationText, friendlyError } from './format';

test('overload errors become student advice, others pass through', () => {
  expect(friendlyError('Request rate limit reached')).toMatch(/signing in right now/);
  expect(friendlyError('Timed out acquiring connection from connection pool.')).toMatch(
    /server is busy/,
  );
  expect(friendlyError('TypeError: Failed to fetch')).toMatch(/server is busy/);
  expect(friendlyError('You have already submitted feedback for this session')).toBe(
    'You have already submitted feedback for this session',
  );
});

test('durationText', () => {
  const min = 60000;
  expect(durationText(45 * min)).toBe('45 min');
  expect(durationText(90 * min)).toBe('1 h 30 min');
  expect(durationText(3 * 1440 * min)).toBe('3 days');
  expect(durationText(1441 * min)).toBe('1 day 1 min');
  expect(durationText(0)).toBeNull();
  expect(durationText(-5 * min)).toBeNull();
});
