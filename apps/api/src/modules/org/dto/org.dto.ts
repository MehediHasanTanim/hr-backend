import { z } from 'zod';
import { ZodBody } from '../../../pipes/zod-schema.decorator';
import { uuidSchema } from '../../employees/dto/employee.dto';

export const LocationSchema = z.object({
  name: z.string().min(1).max(150),
  code: z.string().min(1).max(30),
  address: z.record(z.unknown()).optional().nullable(),
  timezone: z.string().max(50).optional().nullable(),
  isActive: z.boolean().default(true),
});

export const DepartmentSchema = z.object({
  name: z.string().min(1).max(150),
  code: z.string().min(1).max(20),
  parentId: uuidSchema.optional().nullable(),
  costCenter: z.string().max(50).optional().nullable(),
  headId: uuidSchema.optional().nullable(),
  isActive: z.boolean().default(true),
});

export const JobTitleSchema = z.object({
  title: z.string().min(1).max(150),
  code: z.string().max(30).optional().nullable(),
  level: z.number().int().optional().nullable(),
  isActive: z.boolean().default(true),
});

export const PayGradeSchema = z.object({
  name: z.string().min(1).max(100),
  code: z.string().min(1).max(30),
  minSalary: z.number().nonnegative().optional().nullable(),
  maxSalary: z.number().nonnegative().optional().nullable(),
  currency: z.string().length(3).default('USD'),
  isActive: z.boolean().default(true),
});

@ZodBody(LocationSchema)
export class LocationBody {}

@ZodBody(DepartmentSchema)
export class DepartmentBody {}

@ZodBody(JobTitleSchema)
export class JobTitleBody {}

@ZodBody(PayGradeSchema)
export class PayGradeBody {}

export type LocationDto = z.infer<typeof LocationSchema>;
export type DepartmentDto = z.infer<typeof DepartmentSchema>;
export type JobTitleDto = z.infer<typeof JobTitleSchema>;
export type PayGradeDto = z.infer<typeof PayGradeSchema>;
