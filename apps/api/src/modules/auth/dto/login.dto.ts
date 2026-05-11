import { z } from 'zod';
import { ZodBody } from '../../../pipes/zod-schema.decorator';

export const LoginSchema = z.object({
  email: z.string().email().transform((value) => value.toLowerCase()),
  password: z.string().min(1),
});

export type LoginDto = z.infer<typeof LoginSchema>;

@ZodBody(LoginSchema)
export class LoginBody {}
