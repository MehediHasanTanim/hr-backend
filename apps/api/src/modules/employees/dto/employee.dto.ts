import { z } from 'zod';
import { ZodBody } from '../../../pipes/zod-schema.decorator';

export const uuidSchema = z.string().uuid();
const dateSchema = z.coerce.date();
const optionalUuid = uuidSchema.optional().nullable();

export const EmployeeQuerySchema = z.object({
  department: uuidSchema.optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ON_LEAVE', 'TERMINATED']).optional(),
  location: uuidSchema.optional(),
  search: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  sortBy: z.enum(['employeeNumber', 'workEmail', 'joinedAt', 'createdAt', 'status']).default('employeeNumber'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

export const EmployeeWriteSchema = z.object({
  employeeNumber: z.string().min(1).max(30).optional(),
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  email: z.string().email().optional(),
  workEmail: z.string().email().optional(),
  workPhone: z.string().max(30).optional(),
  joinedAt: dateSchema.optional(),
  employmentType: z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN']).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ON_LEAVE', 'TERMINATED']).optional(),
  departmentId: optionalUuid,
  managerId: optionalUuid,
  jobTitleId: optionalUuid,
  locationId: optionalUuid,
  payGradeId: optionalUuid,
  probationEndsAt: dateSchema.optional().nullable(),
  lastWorkingDate: dateSchema.optional().nullable(),
  nationalId: z.string().max(100).optional().nullable(),
  passportNumber: z.string().max(100).optional().nullable(),
  personalEmail: z.string().email().optional().nullable(),
  personalPhone: z.string().max(30).optional().nullable(),
  customFields: z.unknown().optional(),
});

export const PromoteEmployeeSchema = z.object({
  jobTitleId: uuidSchema,
  payGradeId: optionalUuid,
  effectiveDate: dateSchema.default(() => new Date()),
  notes: z.string().max(1000).optional(),
});

export const TransferEmployeeSchema = z.object({
  departmentId: optionalUuid,
  locationId: optionalUuid,
  managerId: optionalUuid,
  effectiveDate: dateSchema.default(() => new Date()),
  notes: z.string().max(1000).optional(),
});

export const TerminateEmployeeSchema = z.object({
  lastWorkingDate: dateSchema,
  exitReason: z.string().max(1000).optional(),
});

export const AddressSchema = z.object({
  type: z.enum(['HOME', 'MAILING', 'WORK', 'OTHER']).default('HOME'),
  line1: z.string().min(1).max(200),
  line2: z.string().max(200).optional().nullable(),
  city: z.string().min(1).max(100),
  state: z.string().max(100).optional().nullable(),
  postalCode: z.string().max(30).optional().nullable(),
  country: z.string().length(2),
  isPrimary: z.boolean().default(false),
});

export const EmergencyContactSchema = z.object({
  name: z.string().min(1).max(150),
  relationship: z.string().min(1).max(50),
  phone: z.string().min(1).max(30),
  email: z.string().email().optional().nullable(),
  isPrimary: z.boolean().default(false),
});

export const BankAccountSchema = z.object({
  accountName: z.string().min(1).max(150),
  accountNumber: z.string().min(4).max(100),
  routingNumber: z.string().max(30).optional().nullable(),
  bankName: z.string().min(1).max(100),
  bankCode: z.string().max(30).optional().nullable(),
  currency: z.string().length(3),
  isPrimary: z.boolean().default(false),
});

@ZodBody(EmployeeWriteSchema)
export class EmployeeWriteBody {}

@ZodBody(PromoteEmployeeSchema)
export class PromoteEmployeeBody {}

@ZodBody(TransferEmployeeSchema)
export class TransferEmployeeBody {}

@ZodBody(TerminateEmployeeSchema)
export class TerminateEmployeeBody {}

@ZodBody(AddressSchema)
export class AddressBody {}

@ZodBody(EmergencyContactSchema)
export class EmergencyContactBody {}

@ZodBody(BankAccountSchema)
export class BankAccountBody {}

export type EmployeeQueryDto = z.infer<typeof EmployeeQuerySchema>;
export type EmployeeWriteDto = z.infer<typeof EmployeeWriteSchema>;
export type PromoteEmployeeDto = z.infer<typeof PromoteEmployeeSchema>;
export type TransferEmployeeDto = z.infer<typeof TransferEmployeeSchema>;
export type TerminateEmployeeDto = z.infer<typeof TerminateEmployeeSchema>;
export type AddressDto = z.infer<typeof AddressSchema>;
export type EmergencyContactDto = z.infer<typeof EmergencyContactSchema>;
export type BankAccountDto = z.infer<typeof BankAccountSchema>;
