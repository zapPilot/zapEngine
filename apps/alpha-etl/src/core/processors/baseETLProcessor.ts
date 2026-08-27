import type {
  DataSource,
  ETLJob,
  ETLProcessResult,
} from '../../types/index.js';
import { toErrorMessage } from '../../utils/errors.js';
import type { HealthCheckResult } from '../../utils/healthCheck.js';
import { logger } from '../../utils/logger.js';
import type { WriteResult } from '../database/baseWriter.js';
import { validateETLJob as performValidation } from './validation.js';

export type { ETLProcessResult, HealthCheckResult };

/**
 * Base interface for ETL processors handling different data source types
 */
export interface BaseETLProcessor {
  /**
   * Process a single data source for an ETL job
   */
  process(job: ETLJob): Promise<ETLProcessResult>;

  /**
   * Perform health check for the data source
   */
  healthCheck(): Promise<HealthCheckResult>;

  /**
   * Get processing statistics
   */
  getStats(): Record<string, unknown>;

  /**
   * Get the data source type this processor handles
   */
  getSourceType(): string;
}

/**
 * Shared ETL flow execution helper
 * Eliminates duplicate process() pattern across ETL processors
 */
export async function executeETLFlow<TRaw, TTransformed>(
  job: ETLJob,
  source: DataSource,
  fetchFn: () => Promise<TRaw[]>,
  transformFn: (raw: TRaw[]) => Promise<TTransformed[]>,
  writeFn: (data: TTransformed[]) => Promise<WriteResult>,
  options?: {
    allowEmptyFetch?: boolean;
    allowEmptyTransform?: boolean;
  },
): Promise<ETLProcessResult> {
  const allowEmptyFetch = options?.allowEmptyFetch === true;
  const allowEmptyTransform = options?.allowEmptyTransform === true;

  const result = createETLProcessResult(source);

  // `allowEmptyFetch`/`allowEmptyTransform` mark the sources for which nothing
  // is a legitimate answer (a wallet that holds no positions). Where they are
  // not set, emptiness is a provider or transform fault, and a silent success
  // is indistinguishable from a healthy no-op run: it reports 0/0 with no
  // errors and the caller sees a green job.
  const failEmpty = (message: string): ETLProcessResult => {
    logger.error(message, { jobId: job.jobId });
    result.success = false;
    result.errors.push(message);
    return result;
  };

  try {
    logger.info(`Processing ${source} data`, { jobId: job.jobId });

    const rawData = await fetchFn();
    result.recordsProcessed = rawData.length;

    if (rawData.length === 0 && !allowEmptyFetch) {
      return failEmpty(`No data fetched from ${source}`);
    }

    const transformedData = await transformFn(rawData);

    if (transformedData.length === 0 && !allowEmptyTransform) {
      return failEmpty(`No valid data after transformation for ${source}`);
    }

    const writeResult = await writeFn(transformedData);
    result.recordsInserted = writeResult.recordsInserted;
    result.errors.push(...writeResult.errors);
    if (!writeResult.success) {
      result.success = false;
    }

    logger.info(`${source} processing completed`, {
      jobId: job.jobId,
      recordsProcessed: result.recordsProcessed,
      recordsInserted: result.recordsInserted,
      errorCount: result.errors.length,
    });

    return result;
  } catch (error) {
    logger.error(`${source} processing failed:`, {
      jobId: job.jobId,
      error,
    });

    result.success = false;
    result.errors.push(toErrorMessage(error));
    return result;
  }
}

function createETLProcessResult(source: DataSource): ETLProcessResult {
  return {
    success: true,
    recordsProcessed: 0,
    recordsInserted: 0,
    errors: [],
    source,
  };
}

/**
 * Create a failed ETL result for early-exit error paths (e.g. validation failures).
 * Shared across processors to eliminate duplicate private methods.
 */
export function createFailedETLResult(
  source: DataSource,
  message: string,
): ETLProcessResult {
  return {
    success: false,
    recordsProcessed: 0,
    recordsInserted: 0,
    errors: [message],
    source,
  };
}

/**
 * Validate ETL job and execute a processor function, with automatic error handling.
 * Eliminates duplicate try/catch + validateETLJob pattern in every processor.
 *
 * @param job - ETL job to validate
 * @param source - Data source type
 * @param fn - Function to execute if validation succeeds
 * @returns Result from fn or a failed result if validation fails
 */
export async function withValidatedJob<T extends ETLProcessResult>(
  job: ETLJob,
  source: DataSource,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    performValidation(job);
    return await fn();
  } catch (error) {
    const message = toErrorMessage(error);
    logger.error(`${source} processing failed`, {
      jobId: job.jobId,
      error,
    });
    return createFailedETLResult(source, message) as T;
  }
}
