import type { WriteResult } from '../../core/database/baseWriter.js';
import { toErrorMessage } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';

export interface ProcessorStats {
  totalProcessed: number;
  totalErrors: number;
  lastProcessedAt: Date | null;
}

interface SnapshotWriter<T> {
  insertSnapshot(data: T): Promise<void>;
}

export async function writeSnapshotData<T>(
  data: T[],
  writer: SnapshotWriter<T>,
): Promise<WriteResult> {
  let recordsInserted = 0;
  for (const snapshot of data) {
    await writer.insertSnapshot(snapshot);
    recordsInserted += 1;
  }
  return {
    success: true,
    recordsInserted,
    errors: [],
    duplicatesSkipped: 0,
  };
}

export async function runDmaPostStep(
  jobId: string,
  updateDma: () => Promise<{ recordsInserted: number }>,
): Promise<void> {
  try {
    const dmaResult = await updateDma();
    logger.info('DMA post-step completed', {
      jobId,
      dmaRecordsInserted: dmaResult.recordsInserted,
    });
  } catch (error) {
    logger.warn('DMA post-step failed (non-fatal)', {
      jobId,
      error: toErrorMessage(error),
    });
  }
}

export function logProcessorFailureAndRethrow(
  message: string,
  context: Record<string, unknown>,
  error: unknown,
): never {
  logger.error(message, {
    ...context,
    error: toErrorMessage(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  throw error;
}

export function createProcessorStats(): ProcessorStats {
  return {
    totalProcessed: 0,
    totalErrors: 0,
    lastProcessedAt: null,
  };
}

export function calculateSuccessRate(stats: ProcessorStats): string {
  if (stats.totalProcessed === 0) {
    return 'N/A';
  }

  const successfulCount = stats.totalProcessed - stats.totalErrors;
  const successRate = (successfulCount / stats.totalProcessed) * 100;
  return `${successRate.toFixed(2)}%`;
}

export function buildProcessorStats(
  stats: ProcessorStats,
  includeSuccessRate = false,
): Record<string, unknown> {
  const summary: Record<string, unknown> = {
    totalProcessed: stats.totalProcessed,
    totalErrors: stats.totalErrors,
    lastProcessedAt: stats.lastProcessedAt?.toISOString() ?? null,
  };

  if (includeSuccessRate) {
    summary['successRate'] = calculateSuccessRate(stats);
  }

  return summary;
}
