import { HttpException } from '@nestjs/common';
import { NotFoundError } from '@hr/shared';
import { z } from 'zod';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AllExceptionsFilter } from './all-exceptions.filter';

function createHost() {
  const status = vi.fn().mockReturnThis();
  const send = vi.fn();
  const reply = { status, send };
  const request = { url: '/x', headers: { 'x-trace-id': 'trace-1' } };

  return {
    status,
    send,
    host: {
      switchToHttp: () => ({
        getResponse: () => reply,
        getRequest: () => request,
      }),
    },
  };
}

describe('AllExceptionsFilter', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'test';
  });

  it('maps ZodError to 422 with errors', () => {
    const filter = new AllExceptionsFilter();
    const { host, status, send } = createHost();
    const schema = z.object({ name: z.string() });
    const result = schema.safeParse({ name: 123 });

    if (result.success) throw new Error('expected parse failure');

    filter.catch(result.error, host as never);

    expect(status).toHaveBeenCalledWith(422);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ status: 422, errors: expect.any(Array) }));
  });

  it('maps NotFoundError to 404 and preserves correlationId', () => {
    const filter = new AllExceptionsFilter();
    const { host, send } = createHost();
    const err = new NotFoundError('missing', { correlationId: 'corr-1' });

    filter.catch(err, host as never);

    expect(send).toHaveBeenCalledWith(expect.objectContaining({ status: 404, correlationId: 'corr-1' }));
  });

  it('maps HttpException to provided status', () => {
    const filter = new AllExceptionsFilter();
    const { host, send } = createHost();

    filter.catch(new HttpException('denied', 403), host as never);

    expect(send).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
  });

  it('hides unknown error details in production', () => {
    process.env.NODE_ENV = 'production';
    const filter = new AllExceptionsFilter();
    const { host, send } = createHost();

    filter.catch(new Error('private message'), host as never);

    expect(send).toHaveBeenCalledWith(expect.objectContaining({ detail: 'An unexpected error occurred' }));
  });

  it('exposes unknown error details in development-like env', () => {
    process.env.NODE_ENV = 'development';
    const filter = new AllExceptionsFilter();
    const { host, send } = createHost();

    filter.catch(new Error('debug message'), host as never);

    expect(send).toHaveBeenCalledWith(expect.objectContaining({ detail: 'Error: debug message' }));
  });
});
