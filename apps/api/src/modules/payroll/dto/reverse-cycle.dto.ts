import { z } from 'zod';

export const ReverseCycleSchema = z.object({
  reversalReason: z.string().min(20),
});

export type ReverseCycleDto = z.infer<typeof ReverseCycleSchema>;
