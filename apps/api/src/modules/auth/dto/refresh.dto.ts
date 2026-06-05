import { z } from 'zod';
import { ZodBody } from '../../../pipes/zod-schema.decorator';

export const RefreshSchema = z.object({
  refreshToken: z.string().min(1).optional(),
}).optional();

export type RefreshDto = z.infer<typeof RefreshSchema>;

@ZodBody(RefreshSchema)
export class RefreshBody {}

export const VerifyEmailSchema = z.object({
  otp: z.string().length(6).regex(/^\d{6}$/),
});

export type VerifyEmailDto = z.infer<typeof VerifyEmailSchema>;

@ZodBody(VerifyEmailSchema)
export class VerifyEmailBody {}
