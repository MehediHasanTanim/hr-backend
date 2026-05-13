import { z } from 'zod';
import { ZodSchema } from '../../../pipes/zod-schema.decorator';

const EmployeeWriteSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  email: z.string().email().optional(),
  workEmail: z.string().email().optional(),
  joinedAt: z.coerce.date().optional(),
  employmentType: z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN']).optional(),
  customFields: z.unknown().optional(),
});

@ZodSchema(EmployeeWriteSchema)
export class EmployeeWriteBody {}

export type EmployeeWriteDto = z.infer<typeof EmployeeWriteSchema>;
