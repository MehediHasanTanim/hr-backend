import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '@hr/shared';
import { ZodError } from 'zod';

export interface ErrorResponse {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  traceId?: string;
  correlationId?: string;
  errors?: unknown[];
  timestamp: string;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();
    const traceId = request.headers['x-trace-id'] as string | undefined;
    const isProd = process.env.NODE_ENV === 'production';

    const body = this.buildErrorBody(exception, request, traceId, isProd);

    if (body.status >= 500) {
      this.logger.error({ exception, traceId }, 'Unhandled exception');
    } else {
      this.logger.warn({ code: body.title, traceId }, body.detail);
    }

    void reply.status(body.status).send(body);
  }

  private buildErrorBody(
    exception: unknown,
    request: FastifyRequest,
    traceId: string | undefined,
    isProd: boolean,
  ): ErrorResponse {
    const instance = request.url;
    const timestamp = new Date().toISOString();

    if (exception instanceof ZodError) {
      return {
        type: 'https://httpstatuses.com/422',
        title: 'VALIDATION_ERROR',
        status: 422,
        detail: 'Request validation failed',
        instance,
        traceId,
        errors: exception.errors,
        timestamp,
      };
    }

    if (exception instanceof AppError) {
      return {
        type: `https://httpstatuses.com/${exception.statusCode}`,
        title: exception.code,
        status: exception.statusCode,
        detail: exception.message,
        instance,
        traceId,
        correlationId: exception.correlationId,
        timestamp,
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const res = exception.getResponse();
      const detail = typeof res === 'string' ? res : (res as { message?: string | string[] }).message;
      return {
        type: `https://httpstatuses.com/${status}`,
        title: HttpStatus[status] ?? 'HTTP_ERROR',
        status,
        detail: Array.isArray(detail) ? detail.join(', ') : (detail ?? 'HTTP Exception'),
        instance,
        traceId,
        timestamp,
      };
    }

    return {
      type: 'https://httpstatuses.com/500',
      title: 'INTERNAL_ERROR',
      status: 500,
      detail: isProd ? 'An unexpected error occurred' : String(exception),
      instance,
      traceId,
      timestamp,
    };
  }
}
