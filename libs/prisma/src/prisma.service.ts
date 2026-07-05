import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AppConfigService } from '@hr/api/config';
import { softDeleteExtension } from './extensions/soft-delete.extension';
import { withTenantScope } from './extensions/tenant-scope.extension';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(config?: AppConfigService) {
    super({
      datasourceUrl: config?.get('db').url ?? process.env.DATABASE_URL,
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'error' },
        { emit: 'event', level: 'warn' },
      ],
    });
    Object.defineProperty(this, 'unscopedClient', {
      value: this,
      enumerable: false,
    });
  }

  async onModuleInit(): Promise<void> {
    if (
      process.env.NODE_ENV === 'test'
      || (process.env.VITEST_WORKER_ID ?? false)
      || process.env.DATABASE_URL === 'postgresql://user:pass@localhost:5432/db'
    ) {
      return;
    }

    await this.$connect();
    this.logger.log('Prisma connected');

    if (process.env.NODE_ENV !== 'production') {
      (this.$on as (event: 'query', cb: (e: { query: string; duration: number }) => void) => void)(
        'query',
        (e) => {
          if (e.duration > 500) {
            this.logger.warn(`Slow query (${e.duration}ms): ${e.query}`);
          }
        },
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Prisma disconnected');
  }

  get db() {
    return this.$extends(softDeleteExtension);
  }

  forCompany(companyId: string) {
    return this.$extends(softDeleteExtension).$extends(withTenantScope(companyId));
  }

  /**
   * Returns a Prisma client with the soft-delete extension applied.
   * All delete() operations become soft deletes (sets deletedAt),
   * and all read operations automatically filter out deleted records.
   *
   * For tenant-scoped queries, use {@link forCompany} instead.
   */
  get unscopedClient(): PrismaClient {
    return this.$extends(softDeleteExtension) as unknown as PrismaClient;
  }
}
