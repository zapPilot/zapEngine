import { z } from 'zod';

import {
  type ApiError,
  DATA_SOURCES,
  type DataSource,
} from '../types/index.js';
import {
  APIError,
  DatabaseError,
  ETLError,
  TransformError,
  ValidationError,
} from '../utils/errors.js';
import { logger } from '../utils/logger.js';

type ApiErrorSource = DataSource | 'system' | 'database';

export interface ErrorResolution {
  statusCode: number;
  apiError: ApiError;
}

function normalizeErrorSource(source: string | undefined): ApiErrorSource {
  if (source === 'database') {
    return 'database';
  }

  if (source && DATA_SOURCES.includes(source as DataSource)) {
    return source as DataSource;
  }

  return 'system';
}

export function ensureRequestIdContext(
  apiError: ApiError,
  requestId: string,
): void {
  if (apiError.context && !apiError.context['requestId']) {
    apiError.context['requestId'] = requestId;
  }
}

export function resolveError(
  error: unknown,
  requestId: string,
): ErrorResolution {
  if (error instanceof z.ZodError) {
    return {
      statusCode: 400,
      apiError: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request payload',
        source: 'system',
        context: { issues: error.issues },
      },
    };
  }

  if (error instanceof APIError) {
    return {
      statusCode: error.statusCode,
      apiError: {
        code: 'API_ERROR',
        message: error.message,
        source: normalizeErrorSource(error.source),
        context: { url: error.url, requestId },
      },
    };
  }

  if (error instanceof ValidationError) {
    return {
      statusCode: 400,
      apiError: {
        code: 'VALIDATION_ERROR',
        message: error.message,
        source: 'system',
        context: { field: error.field, value: error.value },
      },
    };
  }

  if (error instanceof DatabaseError) {
    logger.error('Database Error:', { error, requestId });
    return {
      statusCode: 500,
      apiError: {
        code: 'DATABASE_ERROR',
        message: 'Database operation failed',
        source: 'database',
        context: { requestId },
      },
    };
  }

  if (error instanceof TransformError || error instanceof ETLError) {
    return {
      statusCode: 500,
      apiError: {
        code: 'INTERNAL_ERROR',
        message: error.message,
        source: normalizeErrorSource(error.source),
        context: { requestId },
      },
    };
  }

  logger.error('Unhandled System Error:', {
    error,
    requestId,
    stack: error instanceof Error ? error.stack : undefined,
  });

  return {
    statusCode: 500,
    apiError: {
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
      source: 'system',
      context: { requestId },
    },
  };
}
