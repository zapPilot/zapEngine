import { getErrorMessage } from './utils';

export enum HttpStatus {
  OK = 200,
  CREATED = 201,
  ACCEPTED = 202,
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  NOT_FOUND = 404,
  CONFLICT = 409,
  TOO_MANY_REQUESTS = 429,
  INTERNAL_SERVER_ERROR = 500,
  BAD_GATEWAY = 502,
  SERVICE_UNAVAILABLE = 503,
}

export class AppError extends Error {
  public override readonly cause?: Error;
  public readonly statusCode: number;

  constructor(
    message: string,
    statusCode: number = HttpStatus.INTERNAL_SERVER_ERROR,
    cause?: Error,
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.cause = cause;

    /* istanbul ignore next -- only absent in non-V8 environments */
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, AppError);
    }
  }
}

export class HttpException extends AppError {
  constructor(
    message: string,
    statusCode: number = HttpStatus.INTERNAL_SERVER_ERROR,
    cause?: Error,
  ) {
    super(message, statusCode, cause);
    this.name = 'HttpException';
  }

  getStatus(): number {
    return this.statusCode;
  }

  getResponse(): { message: string } {
    return { message: this.message };
  }
}

export class BadRequestException extends HttpException {
  constructor(message = 'Bad request', cause?: Error) {
    super(message, HttpStatus.BAD_REQUEST, cause);
    this.name = 'BadRequestException';
  }
}

export class UnauthorizedException extends HttpException {
  constructor(message = 'Unauthorized', cause?: Error) {
    super(message, HttpStatus.UNAUTHORIZED, cause);
    this.name = 'UnauthorizedException';
  }
}

export class NotFoundException extends HttpException {
  constructor(message = 'Not found', cause?: Error) {
    super(message, HttpStatus.NOT_FOUND, cause);
    this.name = 'NotFoundException';
  }
}

export class ConflictException extends HttpException {
  constructor(message = 'Conflict', cause?: Error) {
    super(message, HttpStatus.CONFLICT, cause);
    this.name = 'ConflictException';
  }
}

export class RateLimitException extends HttpException {
  constructor(message = 'Too many requests', cause?: Error) {
    super(message, HttpStatus.TOO_MANY_REQUESTS, cause);
    this.name = 'RateLimitException';
  }
}

export function getErrorStatus(error: unknown): number {
  if (error instanceof AppError) {
    return error.statusCode;
  }

  if (
    error &&
    typeof error === 'object' &&
    'statusCode' in error &&
    typeof error.statusCode === 'number'
  ) {
    return error.statusCode;
  }

  return HttpStatus.INTERNAL_SERVER_ERROR;
}

export function toErrorResponse(
  path: string,
  error: unknown,
): {
  statusCode: number;
  message: string;
  timestamp: string;
  path: string;
} {
  return {
    statusCode: getErrorStatus(error),
    message: getErrorMessage(error),
    timestamp: new Date().toISOString(),
    path,
  };
}
