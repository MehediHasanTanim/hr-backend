import { describe, it, expect } from 'vitest';
import {
  ConflictError,
  ForbiddenError,
  InternalError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from './base.error';

describe('AppError subclasses', () => {
  it('expose status and code', () => {
    expect(new NotFoundError('x')).toMatchObject({ statusCode: 404, code: 'RESOURCE_NOT_FOUND' });
    expect(new ValidationError('x')).toMatchObject({ statusCode: 422, code: 'VALIDATION_ERROR' });
    expect(new ConflictError('x')).toMatchObject({ statusCode: 409, code: 'CONFLICT' });
    expect(new ForbiddenError('x')).toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
    expect(new UnauthorizedError('x')).toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });
    expect(new InternalError('x')).toMatchObject({ statusCode: 500, code: 'INTERNAL_ERROR' });
  });
});
