import { z } from 'zod';

export const PublicApplySchema = z.object({
  fullName: z.string().min(2).max(200),
  email: z.string().email(),
  phone: z.string().optional(),
});

export type PublicApplyDto = z.infer<typeof PublicApplySchema>;
