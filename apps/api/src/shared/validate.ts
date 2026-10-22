import { z } from 'zod';

const UuidSchema = z.string().uuid();

export function isUuid(val: unknown): val is string {
  return typeof val === 'string' && UuidSchema.safeParse(val).success;
}

export const EmailSchema = z
  .string()
  .trim()
  .email()
  .transform((e) => e.toLowerCase());
