import { z } from 'zod';
import { ExportFormat } from '../enums/export-format.enum';

/** Validates that the string is a valid cron expression using basic pattern matching */
const cronRegex =
  /^(\*|([0-9]|[1-5][0-9])) (\*|([0-9]|1[0-9]|2[0-3])) (\*|([1-9]|[12][0-9]|3[01])) (\*|([1-9]|1[0-2])) (\*|([0-6]))$/;

export const CreateReportScheduleSchema = z.object({
  savedReportId: z.string().uuid(),
  cronExpression: z.string().regex(cronRegex, 'Invalid cron expression format'),
  format: z.nativeEnum(ExportFormat),
  recipientId: z.string().uuid().optional(),
});

export type CreateReportScheduleDto = z.infer<typeof CreateReportScheduleSchema>;

export class CreateReportScheduleBody {}
