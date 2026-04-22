import type { z } from 'zod';

import type { ApiError, ApiResponse } from '../types/index.js';

export function buildSuccessApiResponse<T>(data: T): ApiResponse<T> {
  return {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  };
}

export function buildErrorApiResponse(error: ApiError): ApiResponse {
  return {
    success: false,
    error,
    timestamp: new Date().toISOString(),
  };
}

export function buildValidationErrorApiResponse(
  zodError: z.ZodError,
): ApiResponse {
  return buildErrorApiResponse({
    code: 'VALIDATION_ERROR',
    message: 'Invalid request payload',
    source: 'system',
    context: { issues: zodError.issues },
  });
}

export function buildWebhookErrorApiResponse(
  code: ApiError['code'],
  message: string,
  requestId: string,
  context?: Record<string, unknown>,
): ApiResponse {
  return buildErrorApiResponse({
    code,
    message,
    source: 'system',
    context: { requestId, ...context },
  });
}

export function buildSystemErrorApiResponse(message: string): ApiResponse {
  return buildErrorApiResponse({
    code: 'API_ERROR',
    message,
    source: 'system',
  });
}

export function getRequestId(headers: Record<string, unknown>): string {
  return (headers['x-request-id'] as string | undefined) ?? 'unknown';
}
