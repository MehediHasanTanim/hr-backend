import { z } from 'zod';

export const CreateSalaryComponentSchema = z.object({
  name: z.string().min(1).max(100),
  code: z.string().min(1).max(30),
  type: z.enum(['EARNING', 'DEDUCTION', 'EMPLOYER_CONTRIBUTION']),
  calculationType: z.enum(['fixed', 'formula', 'percentage_of_base']),
  formula: z.string().nullable().optional(),
  defaultValue: z.number().optional(),
  isTaxable: z.boolean().optional().default(true),
});

export type CreateSalaryComponentDto = z.infer<typeof CreateSalaryComponentSchema>;

export const UpdateSalaryComponentSchema = CreateSalaryComponentSchema.partial();
export type UpdateSalaryComponentDto = z.infer<typeof UpdateSalaryComponentSchema>;
