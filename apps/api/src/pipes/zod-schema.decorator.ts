import type { ZodSchema } from 'zod';
import { ZOD_SCHEMA_KEY } from './zod-validation.pipe';

/**
 * Attach a Zod schema to a DTO class so `ZodValidationPipe` can validate
 * request bodies at runtime using the class type from `@Body()`.
 */
export function ZodBody(schema: ZodSchema): ClassDecorator {
  return (target) => {
    Reflect.defineMetadata(ZOD_SCHEMA_KEY, schema, target);
  };
}
