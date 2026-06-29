import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '@hr/prisma';
import type { AuditLogFilterDto } from './dto/audit-log-filter.dto';
import type { Prisma } from '@prisma/client';

@Injectable()
export class AuditLogQueryService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async query(filters: AuditLogFilterDto, companyId: string) {
    const where: Prisma.AuditLogWhereInput = { companyId };

    if (filters.actorId) {
      where.userId = filters.actorId;
    }
    if (filters.resourceType) {
      where.resource = filters.resourceType;
    }
    if (filters.action) {
      where.action = filters.action;
    }
    if (filters.dateFrom || filters.dateTo) {
      where.createdAt = {};
      if (filters.dateFrom) {
        (where.createdAt as Prisma.DateTimeFilter).gte = new Date(filters.dateFrom);
      }
      if (filters.dateTo) {
        (where.createdAt as Prisma.DateTimeFilter).lte = new Date(filters.dateTo);
      }
    }

    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const skip = (page - 1) * limit;

    const [data, total] = await this.prisma.unscopedClient.$transaction([
      this.prisma.unscopedClient.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      }),
      this.prisma.unscopedClient.auditLog.count({ where }),
    ]);

    return {
      data: data.map((log: { id: string; userId: string | null; action: string; resource: string; resourceId: string | null; after: Prisma.JsonValue | null; ipAddress: string | null; createdAt: Date; user: { firstName: string; lastName: string; email: string } | null }) => ({
        id: log.id,
        actorId: log.userId,
        actorName: log.user
          ? `${log.user.firstName} ${log.user.lastName}`.trim()
          : null,
        action: log.action,
        resourceType: log.resource,
        resourceId: log.resourceId,
        metadata: log.after,
        ipAddress: log.ipAddress,
        createdAt: log.createdAt,
      })),
      total,
      page,
      limit,
    };
  }
}
