// Mock for @nestjs/event-emitter — used in test environments where the package is not installed
export class EventEmitter2 {
  emit = (..._args: unknown[]): void => {};
  on = (..._args: unknown[]): void => {};
  off = (..._args: unknown[]): void => {};
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function OnEvent(_event: string | string[], _options?: any): MethodDecorator {
  return (_target: object, _propertyKey: string | symbol, _descriptor: PropertyDescriptor): PropertyDescriptor => _descriptor;
}

export class EventEmitterModule {
  static forRoot(): { module: typeof EventEmitterModule; global: boolean } {
    return { module: EventEmitterModule, global: true };
  }
}

export const InjectEventEmitter = (): ParameterDecorator => () => {};
