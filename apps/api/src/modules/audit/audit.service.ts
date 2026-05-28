import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '@hr/prisma';
import type { Prisma } from '@prisma/client';
import type { RequestContext } from '../../common/context/request-context';

export interface AuditEntry {
  actor?: RequestContext;
  companyId: string;
  entityType: string;
  entityId?: string;
  action: string;
  oldValue?: Prisma.InputJsonValue | null;
  newValue?: Prisma.InputJsonValue | null;
}

@Injectable()
export class AuditService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry): Promise<void> {
    await this.prisma.unscopedClient.auditLog.create({
      data: {
        companyId: entry.companyId,
        userId: entry.actor?.userId,
        action: entry.action,
        resource: entry.entityType,
        resourceId: entry.entityId,
        before: entry.oldValue ?? undefined,
        after: entry.newValue ?? undefined,
        traceId: entry.actor?.traceId || undefined,
      },
    });
  }
}
