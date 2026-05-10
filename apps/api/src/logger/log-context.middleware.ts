import { Injectable, NestMiddleware } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';

@Injectable()
export class LogContextMiddleware implements NestMiddleware {
  use(req: FastifyRequest, _res: FastifyReply, next: () => void): void {
    const bindings: Record<string, string | undefined> = {
      traceId: req.headers['x-trace-id'] as string | undefined,
    };

    const claims = (req as FastifyRequest & {
      user?: { companyId?: string; userId?: string };
    }).user;

    if (claims?.companyId) bindings.companyId = claims.companyId;
    if (claims?.userId) bindings.userId = claims.userId;

    if (typeof req.log.child === 'function') {
      req.log = req.log.child(bindings);
    }
    next();
  }
}
