import { z } from 'zod';

export const AssignEmployeeSalarySchema = z.object({
  employeeId: z.string().uuid(),
  structureId: z.string().uuid(),
  ctc: z.number().min(0),
  effectiveFrom: z.coerce.date(),
  notes: z.string().nullable().optional(),
});

export type AssignEmployeeSalaryDto = z.infer<typeof AssignEmployeeSalarySchema>;
