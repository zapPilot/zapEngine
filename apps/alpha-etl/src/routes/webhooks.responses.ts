import type { EtlError, EtlJobStatus } from '@zapengine/types/etl';

import { EtlJobStatusSchema } from '../schemas/etl.js';
import type { ETLJob, ETLJobResult, ETLProcessResult } from '../types/index.js';

/** Response type for job status endpoint */
export interface JobStatusApiResponse {
  success: boolean;
  data: EtlJobStatus;
  error?: EtlError;
  timestamp: string;
}

export interface JobStatusValidationResult {
  validated: EtlJobStatus;
  validationError?: unknown;
}

function buildFailedResultError(
  result: Extract<ETLJobResult, { success: false }>,
): EtlError {
  return {
    code: result.error.code as
      | 'API_ERROR'
      | 'VALIDATION_ERROR'
      | 'INTERNAL_ERROR'
      | 'RATE_LIMIT_EXCEEDED',
    message: result.error.message,
  };
}

function hasPartialSourceFailures(
  result: Extract<ETLJobResult, { success: true }>,
): boolean {
  return Object.values(result.data.sourceResults).some(
    (sourceResult: ETLProcessResult) =>
      Array.isArray(sourceResult.errors) && sourceResult.errors.length > 0,
  );
}

export function buildJobStatusResponse(
  job: ETLJob,
  result?: ETLJobResult,
): EtlJobStatus {
  const failedResult = result?.success === false;
  const response: EtlJobStatus = {
    jobId: job.jobId,
    status: failedResult ? 'failed' : job.status,
    trigger: job.trigger,
    createdAt: job.createdAt.toISOString(),
  };

  if (result?.success && job.status === 'completed') {
    response.recordsProcessed = result.data.recordsProcessed;
    response.recordsInserted = result.data.recordsInserted;
    response.duration = result.data.duration;
    response.completedAt = result.data.completedAt.toISOString();
  }

  if (response.status === 'failed' && result && !result.success) {
    response.error = buildFailedResultError(result);
  }

  return response;
}

export function validateJobStatusResponse(
  response: EtlJobStatus,
): JobStatusValidationResult {
  const parseResult = EtlJobStatusSchema.safeParse(response);
  if (!parseResult.success) {
    return {
      validated: response,
      validationError: parseResult.error,
    };
  }
  return { validated: parseResult.data };
}

export function determineJobStatusCode(
  job: ETLJob,
  response: EtlJobStatus,
  result?: ETLJobResult,
): number {
  if (job.status === 'pending' || job.status === 'processing') {
    return 202;
  }

  if (response.status === 'failed') {
    return 500;
  }

  if (job.status === 'completed' && result?.success) {
    if (
      hasPartialSourceFailures(result) ||
      result.data.recordsProcessed > result.data.recordsInserted
    ) {
      return 206;
    }
  }

  return 200;
}

export function buildJobStatusApiResponse(
  statusCode: number,
  data: EtlJobStatus,
  error?: EtlError,
): JobStatusApiResponse {
  const apiResponse: JobStatusApiResponse = {
    success: statusCode < 400,
    data,
    timestamp: new Date().toISOString(),
  };

  if (error) {
    apiResponse.error = error;
  }

  return apiResponse;
}
