// Mock for @nestjs/event-emitter — used in test environments where the package is not installed
export class EventEmitter2 {
  emit = (..._args: unknown[]): void => {};
  on = (..._args: unknown[]): void => {};
  off = (..._args: unknown[]): void => {};
}
