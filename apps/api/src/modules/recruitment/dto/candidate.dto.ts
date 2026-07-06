import { z } from 'zod';

export const CreateCandidateSchema = z.object({
  fullName: z.string().min(2).max(200),
  email: z.string().email(),
  phone: z.string().optional(),
  source: z.enum(['CAREERS_PAGE', 'REFERRAL', 'AGENCY', 'MANUAL', 'IMPORT']).default('MANUAL'),
  referredByEmployeeId: z.string().uuid().optional(),
});

export type CreateCandidateDto = z.infer<typeof CreateCandidateSchema>;

export const UpdateCandidateSchema = z.object({
  fullName: z.string().min(2).max(200).optional(),
  phone: z.string().optional(),
  profileData: z.record(z.unknown()).optional(),
});

export type UpdateCandidateDto = z.infer<typeof UpdateCandidateSchema>;
