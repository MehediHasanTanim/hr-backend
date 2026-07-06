import { z } from 'zod';

export const CreateOfferSchema = z.object({
  baseSalary: z.number().positive(),
  bonus: z.number().min(0).optional(),
  equityValue: z.number().min(0).optional(),
  currency: z.string().length(3).default('BDT'),
  startDate: z.string(),
  expiresAt: z.string().datetime().optional(),
});

export type CreateOfferDto = z.infer<typeof CreateOfferSchema>;

export const DeclineOfferSchema = z.object({
  reason: z.string().min(3),
});

export type DeclineOfferDto = z.infer<typeof DeclineOfferSchema>;

export const RescindOfferSchema = z.object({
  reason: z.string().min(3),
});

export type RescindOfferDto = z.infer<typeof RescindOfferSchema>;
