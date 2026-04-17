export class ETLError extends Error {
  constructor(
    message: string,
    public readonly source?: string,
  ) {
    super(message);
    this.name = "ETLError";
  }
}

export class APIError extends ETLError {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly url?: string,
    source?: string,
  ) {
    super(message, source);
    this.name = "APIError";
  }
}

export class DatabaseError extends ETLError {
  constructor(
    message: string,
    public readonly operation?: string,
  ) {
    super(message);
    this.name = "DatabaseError";
  }
}

export class ValidationError extends ETLError {
  constructor(
    message: string,
    public readonly field?: string,
    public readonly value?: unknown,
  ) {
    super(message);
    this.name = "ValidationError";
  }
}

export class TransformError extends ETLError {
  constructor(
    message: string,
    public readonly record?: Record<string, unknown>,
    source?: string,
  ) {
    super(message, source);
    this.name = "TransformError";
  }
}

/**
 * Extract error message from unknown error type
 * Safely converts any caught error to a string message
 */
export function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}
