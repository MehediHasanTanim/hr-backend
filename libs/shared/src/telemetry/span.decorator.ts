import { SpanStatusCode, trace } from '@opentelemetry/api';

export function Span(name?: string): MethodDecorator {
  return (target, propertyKey, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value as (...args: unknown[]) => unknown;
    const spanName = name ?? `${target.constructor.name}.${String(propertyKey)}`;

    descriptor.value = async function wrappedMethod(...args: unknown[]): Promise<unknown> {
      const tracer = trace.getTracer('hr-api');
      return tracer.startActiveSpan(spanName, async (span) => {
        try {
          const result = await originalMethod.apply(this, args);
          span.setStatus({ code: SpanStatusCode.OK });
          return result;
        } catch (error) {
          span.setStatus({ code: SpanStatusCode.ERROR, message: String(error) });
          span.recordException(error as Error);
          throw error;
        } finally {
          span.end();
        }
      });
    };

    return descriptor;
  };
}
