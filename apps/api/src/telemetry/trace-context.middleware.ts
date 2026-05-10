import { Injectable, NestMiddleware } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { context, propagation, trace } from '@opentelemetry/api';

/* eslint-disable @typescript-eslint/no-floating-promises */
@Injectable()
export class TraceContextMiddleware implements NestMiddleware {
  use(req: FastifyRequest, res: FastifyReply, next: () => void): void {
    const extractedContext = propagation.extract(context.active(), req.headers);

    void context.with(extractedContext, () => {
      const span = trace.getActiveSpan();

      if (span) {
        const traceId = span.spanContext().traceId;
        res.header('x-trace-id', traceId);
        req.headers['x-trace-id'] = traceId;
      }

      next();
    });
  }
}
