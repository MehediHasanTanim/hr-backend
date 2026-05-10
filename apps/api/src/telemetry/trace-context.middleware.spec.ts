import { context, propagation, trace } from '@opentelemetry/api';
import { describe, expect, it, vi } from 'vitest';
import { TraceContextMiddleware } from './trace-context.middleware';

describe('TraceContextMiddleware', () => {
  it('sets x-trace-id from active span', () => {
    const middleware = new TraceContextMiddleware();
    const header = vi.fn();
    const next = vi.fn();

    vi.spyOn(propagation, 'extract').mockReturnValue(context.active());
    vi.spyOn(context, 'with').mockImplementation((_ctx, fn) => fn());
    vi.spyOn(trace, 'getActiveSpan').mockReturnValue({
      spanContext: () => ({ traceId: 'abc123' }),
    } as never);

    const req = { headers: {} };
    middleware.use(req as never, { header } as never, next);

    expect(header).toHaveBeenCalledWith('x-trace-id', 'abc123');
    expect(req.headers['x-trace-id']).toBe('abc123');
    expect(next).toHaveBeenCalled();
  });
});
