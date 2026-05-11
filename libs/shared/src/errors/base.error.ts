export abstract class AppError extends Error {
  abstract readonly statusCode: number;

  abstract readonly code: string;

  readonly correlationId?: string;

  readonly meta?: Record<string, unknown>;

  constructor(
    message: string,
    options?: {
      correlationId?: string;
      meta?: Record<string, unknown>;
      cause?: Error;
    },
  ) {
    super(message, { cause: options?.cause });
    this.correlationId = options?.correlationId;
    this.meta = options?.meta;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class NotFoundError extends AppError {
  readonly statusCode = 404;

  readonly code = 'RESOURCE_NOT_FOUND';
}

export class ValidationError extends AppError {
  readonly statusCode = 422;

  readonly code = 'VALIDATION_ERROR';
}

export class BadRequestError extends AppError {
  readonly statusCode = 400;

  readonly code = 'BAD_REQUEST';
}

export class ConflictError extends AppError {
  readonly statusCode = 409;

  readonly code = 'CONFLICT';
}

export class ForbiddenError extends AppError {
  readonly statusCode = 403;

  readonly code = 'FORBIDDEN';
}

export class UnauthorizedError extends AppError {
  readonly statusCode = 401;

  readonly code = 'UNAUTHORIZED';
}

export class InternalError extends AppError {
  readonly statusCode = 500;

  readonly code = 'INTERNAL_ERROR';
}
