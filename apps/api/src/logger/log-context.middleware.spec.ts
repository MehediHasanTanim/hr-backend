import { describe, expect, it, vi } from 'vitest';
import { LogContextMiddleware } from './log-context.middleware';

describe('LogContextMiddleware', () => {
  it('binds companyId and userId when present', () => {
    const child = vi.fn().mockReturnValue({});
    const middleware = new LogContextMiddleware();
    const next = vi.fn();

    middleware.use(
      {
        headers: { 'x-trace-id': 'trace-1' },
        user: { companyId: 'c1', userId: 'u1' },
        log: { child },
      } as never,
      {} as never,
      next,
    );

    expect(child).toHaveBeenCalledWith({ traceId: 'trace-1', companyId: 'c1', userId: 'u1' });
    expect(next).toHaveBeenCalled();
  });

  it('handles missing user', () => {
    const child = vi.fn().mockReturnValue({});
    const middleware = new LogContextMiddleware();

    middleware.use(
      { headers: { 'x-trace-id': 'trace-1' }, log: { child } } as never,
      {} as never,
      vi.fn(),
    );

    expect(child).toHaveBeenCalledWith({ traceId: 'trace-1' });
  });
});
