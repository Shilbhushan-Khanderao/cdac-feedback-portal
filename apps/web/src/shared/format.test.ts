import { expect, test } from 'vitest';
import { friendlyError } from './format';

test('overload errors become student advice, others pass through', () => {
  expect(friendlyError('Request rate limit reached')).toMatch(/signing in right now/);
  expect(friendlyError('Timed out acquiring connection from connection pool.')).toMatch(/server is busy/);
  expect(friendlyError('TypeError: Failed to fetch')).toMatch(/server is busy/);
  expect(friendlyError('You have already submitted feedback for this session')).toBe(
    'You have already submitted feedback for this session',
  );
});
