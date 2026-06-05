import { z } from 'zod';
import { ZodBody } from '../../../pipes/zod-schema.decorator';

export const ApplyLeaveSchema = z.object({
  leaveTypeId: z.string().uuid(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  reason: z.string().max(2000).optional().nullable(),
}).refine(
  (data) => data.startDate <= data.endDate,
  { message: 'startDate must be <= endDate', path: ['startDate'] },
);

export const RejectLeaveSchema = z.object({
  rejectionReason: z.string().min(1).max(2000),
});

export const LeaveCalendarQuerySchema = z.object({
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  departmentId: z.string().uuid().optional(),
  companyId: z.string().uuid().optional(),
}).refine(
  (data) => {
    const diffMs = data.endDate.getTime() - data.startDate.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    return diffDays <= 90;
  },
  { message: 'Date range must not exceed 90 days', path: ['endDate'] },
);

export type ApplyLeaveDto = z.infer<typeof ApplyLeaveSchema>;
export type RejectLeaveDto = z.infer<typeof RejectLeaveSchema>;
export type LeaveCalendarQueryDto = z.infer<typeof LeaveCalendarQuerySchema>;

@ZodBody(ApplyLeaveSchema)
export class ApplyLeaveBody {}

@ZodBody(RejectLeaveSchema)
export class RejectLeaveBody {}
