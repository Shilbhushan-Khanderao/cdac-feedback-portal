import { z } from 'zod';

const FacultyArray = z.array(z.string().trim().min(1).max(255)).max(20);

export const CreateSessionSchema = z.object({
  batch_id: z.string().uuid(),
  centre_id: z.string().uuid(),
  course_id: z.string().uuid(),
  module_id: z.string().uuid(),
  faculty: FacultyArray.default([]),
  opens_at: z.string().datetime(),
  closes_at: z.string().datetime(),
});
export type CreateItem = z.infer<typeof CreateSessionSchema>;

export const FacultyUpdateSchema = z.object({ faculty: FacultyArray });

export const RescheduleSchema = z.object({
  opens_at: z.string().datetime().optional(),
  closes_at: z.string().datetime().optional(),
});
