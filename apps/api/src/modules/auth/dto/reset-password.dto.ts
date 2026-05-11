import { z } from 'zod';
import { ZodBody } from '../../../pipes/zod-schema.decorator';

export const ResetPasswordSchema = z.object({
  token: z.string().min(64).max(64),
  newPassword: z.string()
    .min(8)
    .regex(/[A-Z]/)
    .regex(/[0-9]/)
    .regex(/[^A-Za-z0-9]/),
});

export const AcceptInviteSchema = z.object({
  token: z.string().min(64).max(64),
  password: z.string()
    .min(8)
    .regex(/[A-Z]/)
    .regex(/[0-9]/)
    .regex(/[^A-Za-z0-9]/),
});

export type ResetPasswordDto = z.infer<typeof ResetPasswordSchema>;
export type AcceptInviteDto = z.infer<typeof AcceptInviteSchema>;

@ZodBody(ResetPasswordSchema)
export class ResetPasswordBody {}

@ZodBody(AcceptInviteSchema)
export class AcceptInviteBody {}
