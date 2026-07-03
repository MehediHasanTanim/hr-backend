import { z } from 'zod';

export const EmployeeSummarySchema = z.object({
  employeeId: z.string().uuid(),
});

export type EmployeeSummaryDto = z.infer<typeof EmployeeSummarySchema>;

export const TeamLeaveQuerySchema = z.object({
  status: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type TeamLeaveQueryDto = z.infer<typeof TeamLeaveQuerySchema>;
