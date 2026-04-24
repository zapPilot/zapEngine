import type { WriteResult } from '../../core/database/baseWriter.js';
import type { TokenPriceData } from '../../modules/token-price/fetcher.js';

interface ProcessorStats {
  totalProcessed: number;
  totalErrors: number;
  lastProcessedAt: Date | null;
}

interface SnapshotWriter {
  insertSnapshot(data: TokenPriceData): Promise<void>;
}

interface DmaHealthService {
  getLatestDmaSnapshot(tokenSymbol: string): Promise<{
    date: string;
    dma200: number | null;
    isAboveDma: boolean | null;
  } | null>;
}

export async function writeSnapshotData(
  data: TokenPriceData[],
  writer: SnapshotWriter,
): Promise<WriteResult> {
  const snapshot = data[0]!;
  await writer.insertSnapshot(snapshot);
  return {
    success: true,
    recordsInserted: 1,
    errors: [],
    duplicatesSkipped: 0,
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
