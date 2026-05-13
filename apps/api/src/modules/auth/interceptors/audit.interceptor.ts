import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { PrismaService } from '@hr/prisma';
import type { Prisma } from '@prisma/client';
import type { FastifyRequest } from 'fastify';
import { Observable, tap } from 'rxjs';
import type { RequestContext } from '../../../common/context/request-context';

const AUDITED_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);
const SENSITIVE_FIELDS = new Set([
  'password',
  'passwordHash',
  'newPassword',
  'currentPassword',
  'token',
  'secret',
  'otp',
]);

interface AuditLogInput extends Prisma.AuditLogUncheckedCreateInput {
  durationMs?: number;
}

export function sanitizeAuditPayload(obj: unknown, depth = 0): unknown {
  if (depth > 5 || obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map((item) => sanitizeAuditPayload(item, depth + 1));

  return Object.fromEntries(
    Object.entries(obj as Record<string, unknown>).map(([key, value]) => [
      key,
      SENSITIVE_FIELDS.has(key) ? '[REDACTED]' : sanitizeAuditPayload(value, depth + 1),
    ]),
  );
}

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(private readonly prisma: PrismaService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = ctx.switchToHttp().getRequest<FastifyRequest & { user?: RequestContext }>();
    if (!AUDITED_METHODS.has(request.method)) return next.handle();

    const before = Date.now();
    const user = request.user;
    if (!user) return next.handle();
    const requestBody = sanitizeAuditPayload(request.body);
    const [, , , resource = 'unknown', resourceId] = request.url.split('/');
    const isTest = process.env.NODE_ENV === 'test';
    const auditDelay = isTest ? Number(request.headers['x-test-audit-delay'] ?? 0) : 0;
    const auditFail = isTest && request.headers['x-test-audit-fail'] === 'true';

    return next.handle().pipe(
      tap({
        next: (value) => {
          const responseResourceId = this.extractResourceId(value);
          void this.writeAuditLog({
            companyId: user?.companyId ?? '',
            userId: user?.userId,
            action: `${resource}.${this.methodToAction(request.method)}`,
            resource,
            resourceId: resourceId ?? responseResourceId,
            after: requestBody as Prisma.InputJsonValue,
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
            traceId: user?.traceId,
            durationMs: Date.now() - before,
          }, { delayMs: auditDelay, fail: auditFail }).catch((err) => {
            this.logger.error({ err, traceId: user?.traceId }, 'Audit log write failed');
          });
        },
        error: () => {
          void this.writeAuditLog({
            companyId: user?.companyId ?? '',
            userId: user?.userId,
            action: `${resource}.${this.methodToAction(request.method)}.failed`,
            resource,
            resourceId,
            after: requestBody as Prisma.InputJsonValue,
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
            traceId: user?.traceId,
            durationMs: Date.now() - before,
          }, { delayMs: auditDelay, fail: auditFail }).catch((err) => {
            this.logger.error({ err, traceId: user?.traceId }, 'Audit log write failed');
          });
        },
      }),
    );
  }

  private methodToAction(method: string): string {
    return { POST: 'create', PATCH: 'update', PUT: 'replace', DELETE: 'delete' }[method] ?? 'mutate';
  }

  private extractResourceId(value: unknown): string | undefined {
    if (value && typeof value === 'object') {
      const body = value as { id?: unknown; data?: { id?: unknown } };
      const id = body.id ?? body.data?.id;
      return typeof id === 'string' ? id : undefined;
    }
    return undefined;
  }

  private async writeAuditLog(
    data: AuditLogInput,
    testOptions: { delayMs: number; fail: boolean } = { delayMs: 0, fail: false },
  ): Promise<void> {
    if (!data.companyId) return;
    if (testOptions.delayMs > 0) {
      await new Promise((resolve) => {
        setTimeout(resolve, testOptions.delayMs);
      });
    }
    if (testOptions.fail) {
      throw new Error('Forced audit write failure');
    }
    const persisted = {
      companyId: data.companyId,
      userId: data.userId,
      action: data.action,
      resource: data.resource,
      resourceId: data.resourceId,
      before: data.before,
      after: data.after,
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
      traceId: data.traceId,
    };
    await this.prisma.unscopedClient.auditLog.create({ data: persisted });
  }
}
