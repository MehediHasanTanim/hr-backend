import { z } from 'zod';
import { ReportKey } from '../enums/report-key.enum';

export const ReportQuerySchema = z
  .object({
    reportKey: z.nativeEnum(ReportKey),
    startDate: z.string().datetime({ offset: true }).or(z.string().date()),
    endDate: z.string().datetime({ offset: true }).or(z.string().date()),
    departmentId: z.string().uuid().optional(),
    payrollPeriod: z.string().optional(),
    leaveType: z.string().optional(),
  })
  .refine((data) => new Date(data.startDate) <= new Date(data.endDate), {
    message: 'startDate must be before or equal to endDate',
    path: ['startDate'],
  });

export type ReportQueryDto = z.infer<typeof ReportQuerySchema>;

// Empty class for @ZodBody() decorator pattern
export class ReportQueryBody {}
