import { z } from 'zod';
import { ExportFormat } from '../enums/export-format.enum';

export const TriggerExportSchema = z.object({
  format: z.nativeEnum(ExportFormat),
  recipientId: z.string().uuid().optional(),
});

export type TriggerExportDto = z.infer<typeof TriggerExportSchema>;

export class TriggerExportBody {}
