import { z } from 'zod';
import { ReportKey } from '../enums/report-key.enum';

export const SaveReportSchema = z.object({
  name: z.string().min(2),
  reportKey: z.nativeEnum(ReportKey),
  parameters: z.object({
    startDate: z.string(),
    endDate: z.string(),
    departmentId: z.string().uuid().optional(),
    payrollPeriod: z.string().optional(),
    leaveType: z.string().optional(),
  }),
});

export type SaveReportDto = z.infer<typeof SaveReportSchema>;

export class SaveReportBody {}
