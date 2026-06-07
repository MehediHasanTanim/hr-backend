import { z } from 'zod';

export const StructureComponentSchema = z.object({
  componentId: z.string().uuid(),
  sortOrder: z.number().int().min(0).default(0),
  defaultValue: z.number().min(0).default(0),
});

export const CreateSalaryStructureSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().nullable().optional(),
  components: z.array(StructureComponentSchema).min(1),
});

export type CreateSalaryStructureDto = z.infer<typeof CreateSalaryStructureSchema>;

export const UpdateSalaryStructureSchema = CreateSalaryStructureSchema.partial();
export type UpdateSalaryStructureDto = z.infer<typeof UpdateSalaryStructureSchema>;
