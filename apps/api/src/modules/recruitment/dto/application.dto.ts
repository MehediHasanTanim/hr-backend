import { z } from 'zod';

export const MoveApplicationStageSchema = z.object({
  targetStage: z.enum(['APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER', 'REJECTED', 'WITHDRAWN']),
});

export type MoveApplicationStageDto = z.infer<typeof MoveApplicationStageSchema>;

export const RejectApplicationSchema = z.object({
  reason: z.string().min(5),
});

export type RejectApplicationDto = z.infer<typeof RejectApplicationSchema>;
