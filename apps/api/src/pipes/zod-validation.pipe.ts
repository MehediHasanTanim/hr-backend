import {
  ArgumentMetadata,
  Injectable,
  PipeTransform,
} from '@nestjs/common';
import type { ZodSchema } from 'zod';

export const ZOD_SCHEMA_KEY = 'ZOD_SCHEMA';

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    if (metadata.type !== 'body') {
      return value;
    }

    const schema: ZodSchema | undefined = Reflect.getMetadata(
      ZOD_SCHEMA_KEY,
      metadata.metatype ?? Object,
    );

    if (!schema) {
      return value;
    }

    const result = schema.safeParse(value);

    if (!result.success) {
      throw result.error;
    }

    return result.data;
  }
}
