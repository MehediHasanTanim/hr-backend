import { describe, expect, it } from 'vitest';
import { buildPinoOptions } from './pino.options';

function config(nodeEnv: 'development' | 'production') {
  return {
    get: (key: 'app' | 'log') => {
      if (key === 'app') return { nodeEnv };
      return { level: 'debug' };
    },
  };
}

describe('buildPinoOptions', () => {
  it('uses pretty transport in development', () => {
    const options = buildPinoOptions(config('development') as never);
    expect(options.pinoHttp?.transport).toBeDefined();
  });

  it('has no transport in production', () => {
    const options = buildPinoOptions(config('production') as never);
    expect(options.pinoHttp?.transport).toBeUndefined();
  });

  it('sets level from config', () => {
    const options = buildPinoOptions(config('production') as never);
    expect(options.pinoHttp?.level).toBe('debug');
  });

  it('reads x-trace-id when present', () => {
    const options = buildPinoOptions(config('production') as never);
    const props = options.pinoHttp?.customProps?.({ headers: { 'x-trace-id': 'trace-1' } } as never);
    expect(props).toEqual({ traceId: 'trace-1' });
  });

  it('generates uuid when no headers', () => {
    const options = buildPinoOptions(config('production') as never);
    const props = options.pinoHttp?.customProps?.({ headers: {} } as never);
    expect((props as { traceId: string }).traceId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('ignores /health logs and redacts auth', () => {
    const options = buildPinoOptions(config('production') as never);
    expect(options.pinoHttp?.autoLogging?.ignore?.({ url: '/health' } as never)).toBe(true);
    expect(options.pinoHttp?.redact?.paths).toContain('req.headers.authorization');
  });
});
