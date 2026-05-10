import { describe, expect, it, vi } from 'vitest';

describe('otel bootstrap module', () => {
  it('loads without exporter and defaults sampler ratio to 1.0', async () => {
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = '';
    delete process.env.OTEL_TRACES_SAMPLER_ARG;

    const shutdown = vi.fn().mockResolvedValue(undefined);
    const start = vi.fn().mockResolvedValue(undefined);

    vi.doMock('@opentelemetry/sdk-node', () => ({
      NodeSDK: vi.fn().mockImplementation(() => ({ start, shutdown })),
    }));

    const onSpy = vi.spyOn(process, 'on').mockImplementation(() => process);

    const mod = await import('./otel');
    expect(mod.samplerRatio).toBe(1);

    const sigterm = onSpy.mock.calls.find(([event]) => event === 'SIGTERM')?.[1] as (() => void) | undefined;
    expect(sigterm).toBeDefined();
    sigterm?.();
    await Promise.resolve();

    expect(shutdown).toHaveBeenCalled();
    vi.resetModules();
    onSpy.mockRestore();
  });
});
