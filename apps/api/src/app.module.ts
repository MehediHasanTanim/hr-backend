import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from '@hr/prisma';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from 'nestjs-throttler-storage-redis';
import { ConfigModule } from './config/config.module';
import { LoggerModule } from './logger/logger.module';
import { HealthModule } from './health/health.module';
import { LogContextMiddleware } from './logger/log-context.middleware';
import { TraceContextMiddleware } from './telemetry/trace-context.middleware';
import { RedisModule } from './common/redis/redis.module';
import { MailModule } from './common/mail/mail.module';
import { AppConfigService } from './config/config.service';
import { AuthModule } from './modules/auth/auth.module';
import { CompanyModule } from './modules/company/company.module';
import { RolesModule } from './modules/roles/roles.module';
import { UsersModule } from './modules/users/users.module';
import { EmployeesModule } from './modules/employees/employees.module';
import { PayrollModule } from './modules/payroll/payroll.module';
import { LeaveModule } from './modules/leave/leave.module';
import { ComplianceModule } from './modules/compliance/compliance.module';
import { OrgModule } from './modules/org/org.module';
import { BulkImportModule } from './modules/bulk-import/bulk-import.module';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    LoggerModule,
    RedisModule,
    MailModule,
    ThrottlerModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        throttlers: [{ name: 'default', ttl: 60_000, limit: 500 }],
        ...(config.get('app').nodeEnv === 'test'
          || (process.env.VITEST_WORKER_ID ?? false)
          || process.env.DATABASE_URL === 'postgresql://user:pass@localhost:5432/db'
          ? {}
          : { storage: new ThrottlerStorageRedisService(config.get('redis').url) }),
        skipIf: (ctx) => ctx.switchToHttp().getRequest<{ url: string }>().url === '/health',
        getTracker: (req: { ip?: string; user?: { userId?: string } }) =>
          req.user?.userId ?? req.ip ?? 'unknown',
      }),
    }),
    HealthModule,
    RolesModule,
    AuthModule,
    CompanyModule,
    UsersModule,
    EmployeesModule,
    PayrollModule,
    LeaveModule,
    ComplianceModule,
    OrgModule,
    BulkImportModule,
  ],
  providers: [
    LogContextMiddleware,
    TraceContextMiddleware,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TraceContextMiddleware, LogContextMiddleware).forRoutes('*');
  }
}
