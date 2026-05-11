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

interface DmaHealthService {
  getLatestDmaSnapshot(tokenSymbol: string): Promise<{
    date: string;
    dma200: number | null;
    isAboveDma: boolean | null;
  } | null>;
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

export function updateStatsAfterProcess(
  stats: ProcessorStats,
  success: boolean,
): void {
  if (success) {
    stats.totalProcessed += 1;
    stats.lastProcessedAt = new Date();
    return;
  }

  stats.totalErrors += 1;
}

export function resolveHealthStatus(
  latestSnapshotDate: string | undefined,
  apiStatus: 'healthy' | 'unhealthy',
): { status: 'healthy' | 'unhealthy'; freshness: string } {
  if (!latestSnapshotDate) {
    return { status: 'unhealthy', freshness: 'unknown' };
  }

  const daysDiff = calculateDaysOld(latestSnapshotDate);
  const freshness = `${daysDiff} days old`;
  const status =
    apiStatus === 'healthy' && daysDiff <= 1 ? 'healthy' : 'unhealthy';

  return { status, freshness };
}

function calculateDaysOld(snapshotDate: string): number {
  const latestDate = new Date(snapshotDate);
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  return Math.floor(
    (today.getTime() - latestDate.getTime()) / (1000 * 60 * 60 * 24),
  );
}

export function buildHealthCheckDetails(
  tokenId: string,
  tokenSymbol: string,
  apiStatus: 'healthy' | 'unhealthy',
  latestSnapshot: { date: string; price: number; tokenSymbol: string } | null,
  totalSnapshots: number,
  freshness: string,
  dmaInfo: Record<string, unknown> | null,
): string {
  return JSON.stringify({
    tokenId,
    tokenSymbol,
    apiStatus,
    latestSnapshot: latestSnapshot ?? null,
    totalSnapshots,
    dataFreshness: freshness,
    dma: dmaInfo,
  });
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

export async function getOptionalDmaHealthInfo(
  dmaService: DmaHealthService,
  tokenSymbol: string,
): Promise<Record<string, unknown> | null> {
  try {
    const dmaLatest = await dmaService.getLatestDmaSnapshot(tokenSymbol);
    if (!dmaLatest) {
      return null;
    }

    return {
      latestDate: dmaLatest.date,
      dma200: dmaLatest.dma200,
      isAboveDma: dmaLatest.isAboveDma,
    };
  } catch {
    // DMA info is optional — don't fail the health check
    return null;
  }
}
