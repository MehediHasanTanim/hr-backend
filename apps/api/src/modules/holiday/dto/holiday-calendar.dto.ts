import { z } from 'zod';
import { ZodBody } from '../../../pipes/zod-schema.decorator';

export const CreateHolidayCalendarSchema = z.object({
  name: z.string().min(1).max(255),
  year: z.number().int().min(2000).max(2100),
  isDefault: z.boolean().optional().default(false),
});

export const UpdateHolidayCalendarSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  isDefault: z.boolean().optional(),
});

export const AddHolidaySchema = z.object({
  name: z.string().min(1).max(100),
  date: z.coerce.date(),
  type: z.enum(['PUBLIC', 'OPTIONAL', 'COMPANY']).optional().default('PUBLIC'),
});

export const UpdateHolidaySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  date: z.coerce.date().optional(),
  type: z.enum(['PUBLIC', 'OPTIONAL', 'COMPANY']).optional(),
});

export const HolidayCalendarQuerySchema = z.object({
  year: z.coerce.number().int().optional(),
});

export type CreateHolidayCalendarDto = z.infer<typeof CreateHolidayCalendarSchema>;
export type UpdateHolidayCalendarDto = z.infer<typeof UpdateHolidayCalendarSchema>;
export type AddHolidayDto = z.infer<typeof AddHolidaySchema>;
export type UpdateHolidayDto = z.infer<typeof UpdateHolidaySchema>;

@ZodBody(CreateHolidayCalendarSchema)
export class CreateHolidayCalendarBody {}

@ZodBody(UpdateHolidayCalendarSchema)
export class UpdateHolidayCalendarBody {}

@ZodBody(AddHolidaySchema)
export class AddHolidayBody {}

@ZodBody(UpdateHolidaySchema)
export class UpdateHolidayBody {}
