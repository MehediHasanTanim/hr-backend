import { z } from 'zod';
import { ZodBody } from '../../../pipes/zod-schema.decorator';

export const RegisterSchema = z.object({
  companyName: z.string().min(2).max(200),
  country: z.string().length(2).transform((value) => value.toUpperCase()),
  timezone: z.string().min(3).max(50),
  currency: z.string().length(3).transform((value) => value.toUpperCase()).default('USD'),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email().transform((value) => value.toLowerCase()),
  password: z.string()
    .min(8)
    .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Must contain at least one special character'),
});

export type RegisterDto = z.infer<typeof RegisterSchema>;

@ZodBody(RegisterSchema)
export class RegisterBody {}
