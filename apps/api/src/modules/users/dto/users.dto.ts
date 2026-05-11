import { z } from 'zod';
import { ZodBody } from '../../../pipes/zod-schema.decorator';

export const InviteUserSchema = z.object({
  email: z.string().email().transform((value) => value.toLowerCase()),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  roleIds: z.array(z.string().uuid()).default([]),
}).strict();

export const UpdateUserSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  avatarUrl: z.string().url().nullable().optional(),
  locale: z.string().min(2).max(10).optional(),
}).strict();

export const AssignRolesSchema = z.object({
  roleIds: z.array(z.string().uuid()),
}).strict();

export type InviteUserDto = z.infer<typeof InviteUserSchema>;
export type UpdateUserDto = z.infer<typeof UpdateUserSchema>;
export type AssignRolesDto = z.infer<typeof AssignRolesSchema>;

@ZodBody(InviteUserSchema)
export class InviteUserBody {}

@ZodBody(UpdateUserSchema)
export class UpdateUserBody {}

@ZodBody(AssignRolesSchema)
export class AssignRolesBody {}
