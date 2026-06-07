import { z } from 'zod';

export const CreatePayrollCycleSchema = z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2020).max(2030),
});

export type CreatePayrollCycleDto = z.infer<typeof CreatePayrollCycleSchema>;
