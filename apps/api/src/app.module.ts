import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { PrismaModule } from '@hr/prisma';
import { ConfigModule } from './config/config.module';
import { LoggerModule } from './logger/logger.module';
import { HealthModule } from './health/health.module';
import { LogContextMiddleware } from './logger/log-context.middleware';
import { TraceContextMiddleware } from './telemetry/trace-context.middleware';

@Module({
  imports: [ConfigModule, PrismaModule, LoggerModule, HealthModule],
  providers: [LogContextMiddleware, TraceContextMiddleware],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TraceContextMiddleware, LogContextMiddleware).forRoutes('*');
  }
}
