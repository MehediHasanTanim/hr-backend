import { z } from 'zod';

export const CreateJobRequisitionSchema = z.object({
  title: z.string().min(3).max(255),
  departmentId: z.string().uuid().optional(),
  employmentType: z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN']),
  locationType: z.enum(['ONSITE', 'REMOTE', 'HYBRID']).default('ONSITE'),
  headcountApproved: z.number().int().min(1),
  jobDescription: z.string().optional(),
  requirements: z.string().optional(),
  salaryRangeMin: z.number().positive().optional(),
  salaryRangeMax: z.number().positive().optional(),
});

export type CreateJobRequisitionDto = z.infer<typeof CreateJobRequisitionSchema>;

export const ApproveRequisitionSchema = z.object({
  publish: z.boolean().default(true),
});

export type ApproveRequisitionDto = z.infer<typeof ApproveRequisitionSchema>;

export const CloseRequisitionSchema = z.object({
  reason: z.string().optional(),
  force: z.boolean().default(false),
});

export type CloseRequisitionDto = z.infer<typeof CloseRequisitionSchema>;
