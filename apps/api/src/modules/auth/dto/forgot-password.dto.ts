import { z } from 'zod';
import { ZodBody } from '../../../pipes/zod-schema.decorator';

export const ForgotPasswordSchema = z.object({
  email: z.string().email().transform((value) => value.toLowerCase()),
});

export type ForgotPasswordDto = z.infer<typeof ForgotPasswordSchema>;

@ZodBody(ForgotPasswordSchema)
export class ForgotPasswordBody {}
