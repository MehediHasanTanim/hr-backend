import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { instanceToPlain } from 'class-transformer';
import type { ApiResponse } from '@hr/shared';

const INTERNAL_FIELD_PATTERN = /^(_|password|secret|token)/;

function stripInternal(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj.map(stripInternal);
  }

  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>)
        .filter(([key]) => !INTERNAL_FIELD_PATTERN.test(key))
        .map(([key, val]) => [key, stripInternal(val)]),
    );
  }

  return obj;
}

@Injectable()
export class SerializeInterceptor implements NestInterceptor {
  intercept(_ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((value: unknown) => {
        if (value !== null && typeof value === 'object' && 'data' in value) {
          return value;
        }

        const plain = instanceToPlain(value, { excludeExtraneousValues: false });
        return { data: stripInternal(plain) } satisfies ApiResponse<unknown>;
      }),
    );
  }
}
