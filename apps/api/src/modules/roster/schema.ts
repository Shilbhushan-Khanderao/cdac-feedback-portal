import { z } from 'zod';

const StudentSchema = z.object({
  email: z.string().trim().email().max(254),
  prn: z.string().trim().min(1).max(64),
  full_name: z.string().trim().min(1).max(255),
  batch_id: z.string().uuid(),
  centre_id: z.string().uuid(),
  course_id: z.string().uuid(),
});

export const RosterUpsertSchema = z.object({
  students: z.array(StudentSchema).min(1).max(2000),
});

export type Student = z.infer<typeof StudentSchema>;
