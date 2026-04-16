import type { BaseBatchResult, DataSource } from '../../types/index.js';
import type { ETLProcessResult } from '../../core/processors/baseETLProcessor.js';

export interface ETLJobProcessingResult extends BaseBatchResult {
  recordsProcessed: number;
  sourceResults: Record<DataSource, ETLProcessResult>;
}

export interface ProcessorHealthSummary {
  status: 'healthy' | 'unhealthy';
  sources: Record<DataSource, { status: 'healthy' | 'unhealthy'; details?: string }>;
}

export function createProcessingResult(): ETLJobProcessingResult {
  return {
    success: true,
    recordsProcessed: 0,
    recordsInserted: 0,
    errors: [],
    sourceResults: {} as Record<DataSource, ETLProcessResult>
  };
}

export function accumulateSourceResult(
  target: ETLJobProcessingResult,
  source: DataSource,
  sourceResult: ETLProcessResult
): void {
  target.sourceResults[source] = sourceResult;
  target.recordsProcessed += sourceResult.recordsProcessed;
  target.recordsInserted += sourceResult.recordsInserted;
  target.errors.push(...sourceResult.errors.map((err) => `${source}: ${err}`));

  if (!sourceResult.success) {
    target.success = false;
  }
}

export function createSingleSourceFailureResult(errorMessage: string): ETLJobProcessingResult {
  return {
    success: false,
    recordsProcessed: 0,
    recordsInserted: 0,
    errors: [errorMessage],
    sourceResults: {} as Record<DataSource, ETLProcessResult>
  };
}

export function createSingleSourceSuccessResult(sourceResult: ETLProcessResult): ETLJobProcessingResult {
  return {
    success: sourceResult.success,
    recordsProcessed: sourceResult.recordsProcessed,
    recordsInserted: sourceResult.recordsInserted,
    errors: sourceResult.errors,
    sourceResults: {
      [sourceResult.source]: sourceResult
    } as Record<DataSource, ETLProcessResult>
  };
}

export function buildJobSummary(sourceResults: Record<DataSource, ETLProcessResult>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(sourceResults).map(([source, res]) => [
      source,
      {
        success: res.success,
        processed: res.recordsProcessed,
        inserted: res.recordsInserted,
        errors: res.errors.length
      }
    ])
  );
}
