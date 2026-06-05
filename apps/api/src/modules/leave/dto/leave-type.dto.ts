import { z } from 'zod';
import { ZodBody } from '../../../pipes/zod-schema.decorator';

export const CreateLeaveTypeSchema = z.object({
  name: z.string().min(1).max(100),
  code: z.string().min(1).max(30),
  accrualType: z.enum(['MONTHLY', 'ANNUAL', 'NONE']).default('NONE'),
  accrualAmount: z.coerce.number().min(0).max(999.99).default(0),
  maxCarryForward: z.coerce.number().min(0).max(999.99).default(0),
  maxBalance: z.coerce.number().min(0).max(999.99).default(0),
  isPaid: z.boolean().default(true),
  isActive: z.boolean().default(true),
}).refine(
  (data) => {
    if (data.accrualType === 'NONE') return data.accrualAmount === 0;
    return data.accrualAmount > 0;
  },
  { message: 'accrualAmount must be 0 when accrualType is none, and > 0 for monthly/annual', path: ['accrualAmount'] },
).refine(
  (data) => data.maxCarryForward <= data.maxBalance,
  { message: 'maxCarryForward must be <= maxBalance', path: ['maxCarryForward'] },
);

export const UpdateLeaveTypeSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  code: z.string().min(1).max(30).optional(),
  accrualType: z.enum(['MONTHLY', 'ANNUAL', 'NONE']).optional(),
  accrualAmount: z.coerce.number().min(0).max(999.99).optional(),
  maxCarryForward: z.coerce.number().min(0).max(999.99).optional(),
  maxBalance: z.coerce.number().min(0).max(999.99).optional(),
  isPaid: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export type CreateLeaveTypeDto = z.infer<typeof CreateLeaveTypeSchema>;
export type UpdateLeaveTypeDto = z.infer<typeof UpdateLeaveTypeSchema>;

@ZodBody(CreateLeaveTypeSchema)
export class CreateLeaveTypeBody {}

@ZodBody(UpdateLeaveTypeSchema)
export class UpdateLeaveTypeBody {}
