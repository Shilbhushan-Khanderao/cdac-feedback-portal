import { z } from 'zod';

export const FacultyInsertSchema = z.object({
  name: z.string().trim().min(1).max(255),
  centre_id: z.string().uuid().nullable().optional(),
});
