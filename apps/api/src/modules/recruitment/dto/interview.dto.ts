import { z } from 'zod';

export const SchedulePanelSchema = z.object({
  scheduledAt: z.string().datetime(),
  durationMinutes: z.number().int().min(15).max(480),
  mode: z.enum(['ONSITE', 'VIDEO', 'PHONE']).default('VIDEO'),
  locationOrLink: z.string().optional(),
  panelistEmployeeIds: z.array(z.string().uuid()).min(1),
  leadEmployeeId: z.string().uuid(),
  autoAdvanceStage: z.boolean().default(true),
});

export type SchedulePanelDto = z.infer<typeof SchedulePanelSchema>;

export const AssignPanelistsSchema = z.object({
  employeeIds: z.array(z.string().uuid()).min(1),
});

export type AssignPanelistsDto = z.infer<typeof AssignPanelistsSchema>;

export const SubmitScorecardSchema = z.object({
  recommendation: z.enum(['STRONG_YES', 'YES', 'NO', 'STRONG_NO']),
  technicalScore: z.number().min(0).max(5).optional(),
  communicationScore: z.number().min(0).max(5).optional(),
  cultureFitScore: z.number().min(0).max(5).optional(),
  notes: z.string().optional(),
});

export type SubmitScorecardDto = z.infer<typeof SubmitScorecardSchema>;

export const CancelPanelSchema = z.object({
  reason: z.string().min(3),
});

export type CancelPanelDto = z.infer<typeof CancelPanelSchema>;
