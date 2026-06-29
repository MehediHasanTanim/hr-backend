import { Inject, Injectable, Logger } from '@nestjs/common';
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
  private readonly logger = new Logger(AuditService.name);

  /** Fields that must never appear in audit log metadata */
  private readonly PII_FIELDS: ReadonlySet<string> = new Set([
    'base64Signature',
    'passwordHash',
    'otpCode',
    'rawToken',
    'signedUrl',
  ]);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Strip sensitive PII fields from metadata before persisting.
   * Shallow strip only — does not recurse into nested objects.
   */
  stripPii(metadata: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(metadata).filter(([key]) => !this.PII_FIELDS.has(key)),
    );
  }

  async record(entry: AuditEntry): Promise<void> {
    const sanitizedNewValue =
      entry.newValue && typeof entry.newValue === 'object' && !Array.isArray(entry.newValue)
        ? this.stripPii(entry.newValue as Record<string, unknown>)
        : entry.newValue;

    await this.prisma.unscopedClient.auditLog.create({
      data: {
        companyId: entry.companyId,
        userId: entry.actor?.userId,
        action: entry.action,
        resource: entry.entityType,
        resourceId: entry.entityId,
        before: entry.oldValue ?? undefined,
        after: sanitizedNewValue as Prisma.InputJsonValue | undefined,
        traceId: entry.actor?.traceId || undefined,
      },
    });
  }

  /**
   * Fire-and-forget audit log write. Does not block the calling request.
   * Errors are swallowed internally and logged — they never propagate to the caller.
   */
  logAsync(entry: AuditEntry): void {
    void this.record(entry).catch((err: Error) => {
      this.logger.error(
        `Async audit log write failed for action ${entry.action}`,
        err,
      );
    });
  }
}
