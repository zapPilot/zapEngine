import { resolveErrorMessage } from '@/lib/errors/errorFactory';
import { ServiceError } from '@/lib/errors/ServiceError';

/**
 * Standard API error response structure.
 */
export interface ApiErrorResponse {
  message?: string;
  status?: number;
  response?: {
    status?: number;
    data?: unknown;
  };
  code?: string;
  details?: Record<string, unknown>;
}

/**
 * Function type for enhancing error messages based on status codes.
 */
export type MessageEnhancer = (status: number, message: string) => string;

type ErrorData = Record<string, unknown>;

function getErrorData(error: unknown): ErrorData {
  if (error && typeof error === 'object') {
    return error as ErrorData;
  }

  return {};
}

function getResponseData(errorData: ErrorData): ErrorData | undefined {
  const response = errorData['response'];
  if (!response || typeof response !== 'object') {
    return undefined;
  }

  return response as ErrorData;
}

/**
 * Type guard for plain object / Error-like API responses.
 *
 * @param error - Raw error value
 * @returns Whether the value is object-like
 */
export function isApiErrorResponse(error: unknown): error is ApiErrorResponse {
  return error !== null && typeof error === 'object';
}

function resolveStatus(errorData: ErrorData): number {
  const responseData = getResponseData(errorData);
  const directStatus = errorData['status'];
  if (typeof directStatus === 'number') {
    return directStatus;
  }

  const responseStatus = responseData?.['status'];
  if (typeof responseStatus === 'number') {
    return responseStatus;
  }

  return 500;
}

function resolveMessageFromSources(
  errorData: ErrorData,
  defaultMessage: string,
): string {
  const responseData = getResponseData(errorData);

  return resolveErrorMessage(
    defaultMessage,
    errorData['message'],
    responseData?.['data'],
    errorData['details'],
  );
}

function resolveCode(errorData: ErrorData): string | undefined {
  const code = errorData['code'];
  return typeof code === 'string' ? code : undefined;
}

function resolveDetails(
  errorData: ErrorData,
): Record<string, unknown> | undefined {
  const details = errorData['details'];
  if (details && typeof details === 'object') {
    return details as Record<string, unknown>;
  }

  return undefined;
}

/**
 * Creates a reusable error mapper for API-driven service callers.
 *
 * @template TError - The error type to construct
 * @param errorFactory - Factory used to build the mapped error
 * @param statusMessages - Optional status-specific message overrides
 * @param defaultMessage - Fallback message when the error is not informative
 * @returns Function that maps unknown errors into typed errors
 */
export function createErrorMapper<TError extends Error>(
  errorFactory: (
    message: string,
    status: number,
    code?: string,
    details?: Record<string, unknown>,
  ) => TError,
  statusMessages: Record<number, string>,
  defaultMessage: string,
): (error: unknown) => TError {
  return function mapError(error: unknown): TError {
    const errorData = getErrorData(error);
    const status = resolveStatus(errorData);
    const message =
      statusMessages[status] ??
      resolveMessageFromSources(errorData, defaultMessage);

    return errorFactory(
      message,
      status,
      resolveCode(errorData),
      resolveDetails(errorData),
    );
  };
}

/**
 * Creates a service-specific `ServiceError` subclass instance from an unknown error.
 *
 * @template T - ServiceError subclass constructor type
 * @param error - Raw error value
 * @param ErrorClass - ServiceError class to instantiate
 * @param defaultMessage - Fallback message when extraction fails
 * @param enhanceMessage - Optional service-specific message enhancer
 * @returns Typed service error instance
 */
export function createServiceError<T extends typeof ServiceError>(
  error: unknown,
  ErrorClass: T,
  defaultMessage: string,
  enhanceMessage?: MessageEnhancer,
): InstanceType<T> {
  const errorData = getErrorData(error);
  const status = resolveStatus(errorData);
  const baseMessage = resolveMessageFromSources(errorData, defaultMessage);
  const message = enhanceMessage
    ? enhanceMessage(status, baseMessage)
    : baseMessage;

  return new ErrorClass(
    message,
    status,
    resolveCode(errorData),
    resolveDetails(errorData),
  ) as InstanceType<T>;
}
