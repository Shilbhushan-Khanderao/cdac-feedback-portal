import { z } from 'zod';

export const SubmitFeedbackSchema = z.object({
  session_id: z.string().uuid(),
  answers: z
    .record(z.string().max(2000))
    .refine((a) => Object.keys(a).length <= 100, 'Too many answers'),
});
