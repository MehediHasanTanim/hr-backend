import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { SerializeInterceptor } from './serialize.interceptor';

export function bootstrapInterceptors(app: NestFastifyApplication): void {
  app.useGlobalInterceptors(new SerializeInterceptor());
}
