import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { AllExceptionsFilter } from './all-exceptions.filter';

export function bootstrapFilters(app: NestFastifyApplication): void {
  app.useGlobalFilters(new AllExceptionsFilter());
}
