/**
 * Shared DMA update orchestration.
 *
 * Token-price and stock-price DMA services share the same post-step shape:
 * log start -> fetch full price history -> empty-guard -> compute snapshots ->
 * write -> log done. Only the price source, snapshot mapping, write behavior,
 * and log fields differ — those are passed in as closures so per-service
 * differences (e.g. stock throws on write failure, token does not) are
 * preserved by the caller's own implementations.
 */

import { logger } from '../../utils/logger.js';

export interface RunDmaUpdateParams<TPrice, TSnapshot> {
  correlationId: string;
  logContext: Record<string, unknown>;
  fetchPrices: () => Promise<TPrice[]>;
  computeSnapshots: (prices: TPrice[]) => TSnapshot[];
  writeSnapshots: (snapshots: TSnapshot[]) => Promise<{
    recordsInserted: number;
  }>;
}

export async function runDmaUpdate<TPrice, TSnapshot>(
  params: RunDmaUpdateParams<TPrice, TSnapshot>,
): Promise<{ recordsInserted: number }> {
  const {
    correlationId,
    logContext,
    fetchPrices,
    computeSnapshots,
    writeSnapshots,
  } = params;

  logger.info('Starting DMA computation post-step', {
    jobId: correlationId,
    ...logContext,
  });

  const prices = await fetchPrices();
  if (prices.length === 0) {
    logger.info('No price history found for DMA computation', {
      jobId: correlationId,
      ...logContext,
    });
    return { recordsInserted: 0 };
  }

  const snapshots = computeSnapshots(prices);
  const writeResult = await writeSnapshots(snapshots);

  logger.info('DMA computation post-step completed', {
    jobId: correlationId,
    ...logContext,
    recordsInserted: writeResult.recordsInserted,
  });

  return { recordsInserted: writeResult.recordsInserted };
}
