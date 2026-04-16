import type { NextFunction, Request, Response } from 'express';
import type { ApiResponse } from '../types/index.js';
import { ensureRequestIdContext, resolveError } from './errorResolution.js';

export function errorHandler(
  error: Error | unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
): void {
  const requestId = (req.headers['x-request-id'] as string | undefined) ?? 'unknown';
  const { statusCode, apiError } = resolveError(error, requestId);

  ensureRequestIdContext(apiError, requestId);

  const response: ApiResponse = {
    success: false,
    error: apiError,
    timestamp: new Date().toISOString()
  };

  res.status(statusCode).json(response);
}

export function notFoundHandler(req: Request, res: Response): void {
  const response: ApiResponse = {
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route not found: ${req.method} ${req.path}`,
      source: 'system',
      context: { requestId: (req.headers['x-request-id'] as string | undefined) ?? 'unknown' }
    },
    timestamp: new Date().toISOString()
  };

  res.status(404).json(response);
}
