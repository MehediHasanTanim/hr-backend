import { EventEmitter } from 'node:events';
import { Injectable } from '@nestjs/common';

type Handler<T> = (payload: T) => void | Promise<void>;

@Injectable()
export class DomainEventsService {
  private readonly emitter = new EventEmitter();

  emit<T>(eventName: string, payload: T): void {
    this.emitter.emit(eventName, payload);
  }

  on<T>(eventName: string, handler: Handler<T>): void {
    this.emitter.on(eventName, (payload: T) => {
      void handler(payload);
    });
  }
}
