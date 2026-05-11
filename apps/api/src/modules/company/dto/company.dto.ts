import { z } from 'zod';
import { ZodBody } from '../../../pipes/zod-schema.decorator';

export const UpdateCompanySchema = z.object({
  name: z.string().min(2).max(200).optional(),
  logoUrl: z.string().url().optional(),
  timezone: z.string().min(3).max(50).optional(),
  currency: z.string().length(3).transform((value) => value.toUpperCase()).optional(),
  fiscalYearStart: z.number().int().min(1).max(12).optional(),
}).strict();

export const UpsertSettingSchema = z.object({
  value: z.unknown(),
});

export type UpdateCompanyDto = z.infer<typeof UpdateCompanySchema>;
export type UpsertSettingDto = z.infer<typeof UpsertSettingSchema>;

@ZodBody(UpdateCompanySchema)
export class UpdateCompanyBody {}

@ZodBody(UpsertSettingSchema)
export class UpsertSettingBody {}
