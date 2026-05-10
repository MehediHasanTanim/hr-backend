import { SpanStatusCode, trace } from '@opentelemetry/api';
import { describe, expect, it, vi } from 'vitest';
import { Span } from './span.decorator';

describe('Span decorator', () => {
  it('creates and ends span on success', async () => {
    const setStatus = vi.fn();
    const end = vi.fn();
    const recordException = vi.fn();

    const tracer = {
      startActiveSpan: async (_name: string, cb: (span: unknown) => Promise<unknown>) => cb({ setStatus, end, recordException }),
    };

    vi.spyOn(trace, 'getTracer').mockReturnValue(tracer as never);

    class TestClass {
      @Span('test.ok')
      async run(): Promise<string> {
        return 'ok';
      }
    }

    const result = await new TestClass().run();

    expect(result).toBe('ok');
    expect(setStatus).toHaveBeenCalledWith({ code: SpanStatusCode.OK });
    expect(end).toHaveBeenCalled();
    expect(recordException).not.toHaveBeenCalled();
  });

  it('records exception and rethrows on error', async () => {
    const setStatus = vi.fn();
    const end = vi.fn();
    const recordException = vi.fn();

    const tracer = {
      startActiveSpan: async (_name: string, cb: (span: unknown) => Promise<unknown>) => cb({ setStatus, end, recordException }),
    };

    vi.spyOn(trace, 'getTracer').mockReturnValue(tracer as never);

    class TestClass {
      @Span('test.fail')
      async run(): Promise<string> {
        throw new Error('boom');
      }
    }

    await expect(new TestClass().run()).rejects.toThrow('boom');
    expect(recordException).toHaveBeenCalled();
    expect(setStatus).toHaveBeenCalledWith(
      expect.objectContaining({ code: SpanStatusCode.ERROR }),
    );
    expect(end).toHaveBeenCalled();
  });
});
