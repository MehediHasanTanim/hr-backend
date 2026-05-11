import { z } from 'zod';
import { ZodBody } from '../../../pipes/zod-schema.decorator';

export const CreateRoleSchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().max(500).optional(),
}).strict();

export const UpdateRoleSchema = CreateRoleSchema.partial().strict();

export const ReplacePermissionsSchema = z.object({
  permissionIds: z.array(z.string().uuid()).default([]),
}).strict();

export type CreateRoleDto = z.infer<typeof CreateRoleSchema>;
export type UpdateRoleDto = z.infer<typeof UpdateRoleSchema>;
export type ReplacePermissionsDto = z.infer<typeof ReplacePermissionsSchema>;

@ZodBody(CreateRoleSchema)
export class CreateRoleBody {}

@ZodBody(UpdateRoleSchema)
export class UpdateRoleBody {}

@ZodBody(ReplacePermissionsSchema)
export class ReplacePermissionsBody {}
