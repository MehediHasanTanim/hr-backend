import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { PrismaService } from '@hr/prisma';
import { AuditInterceptor } from '../modules/auth/interceptors/audit.interceptor';
import { SerializeInterceptor } from './serialize.interceptor';

export function bootstrapInterceptors(app: NestFastifyApplication): void {
  app.useGlobalInterceptors(
    new SerializeInterceptor(),
    new AuditInterceptor(app.get(PrismaService)),
  );
}
