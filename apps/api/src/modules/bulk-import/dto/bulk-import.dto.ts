import { z } from 'zod';
import { ZodBody } from '../../../pipes/zod-schema.decorator';

export const EmployeeCsvImportSchema = z.object({
  csv: z.string().min(1),
});

@ZodBody(EmployeeCsvImportSchema)
export class EmployeeCsvImportBody {}

export type EmployeeCsvImportDto = z.infer<typeof EmployeeCsvImportSchema>;
