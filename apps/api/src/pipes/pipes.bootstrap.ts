import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { ZodValidationPipe } from './zod-validation.pipe';

export function bootstrapPipes(app: NestFastifyApplication): void {
  app.useGlobalPipes(new ZodValidationPipe());
}
