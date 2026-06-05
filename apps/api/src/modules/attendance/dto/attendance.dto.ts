import { z } from 'zod';
import { ZodBody } from '../../../pipes/zod-schema.decorator';

export const ClockInSchema = z.object({
  coordinates: z
    .object({
      lat: z.number(),
      lng: z.number(),
    })
    .optional()
    .nullable(),
  source: z.enum(['WEB', 'MOBILE', 'BIOMETRIC', 'MANUAL']).optional().default('WEB'),
});

export const ClockOutSchema = z.object({});

export const AttendanceExceptionsQuerySchema = z.object({
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  employeeId: z.string().uuid().optional(),
  type: z.enum(['late', 'absent', 'missing_punch']),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
}).refine(
  (data) => {
    const diffMs = data.endDate.getTime() - data.startDate.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    return diffDays <= 31;
  },
  { message: 'Date range must not exceed 31 days', path: ['endDate'] },
);

export const CorrectAttendanceSchema = z.object({
  clockInAt: z.string().datetime().optional(),
  clockOutAt: z.string().datetime().optional(),
  reason: z.string().min(10),
  status: z.enum(['PRESENT', 'ABSENT', 'LATE', 'HALF_DAY', 'ON_LEAVE', 'HOLIDAY']).optional(),
}).refine(
  (data) => {
    if (data.clockInAt && data.clockOutAt) {
      return new Date(data.clockOutAt) > new Date(data.clockInAt);
    }
    return true;
  },
  { message: 'clockOutAt must be after clockInAt', path: ['clockOutAt'] },
);

export type ClockInDto = z.infer<typeof ClockInSchema>;
export type AttendanceExceptionsQueryDto = z.infer<typeof AttendanceExceptionsQuerySchema>;
export type CorrectAttendanceDto = z.infer<typeof CorrectAttendanceSchema>;

@ZodBody(ClockInSchema)
export class ClockInBody {}

@ZodBody(ClockOutSchema)
export class ClockOutBody {}

@ZodBody(CorrectAttendanceSchema)
export class CorrectAttendanceBody {}
