/**
 * Token Price DMA Writer
 *
 * Writes 200-day moving average snapshots with upsert semantics.
 * Upserts on (source, token_symbol, snapshot_date) to allow re-computation.
 *
 * Target: token_price_dma_snapshots table
 */

import {
  BaseDmaWriter,
  type DmaWriterConfig,
} from '../../core/database/baseDmaWriter.js';
import { buildTokenPriceDmaInsertValues } from '../../core/database/columnDefinitions.js';
import type { TokenPriceDmaSnapshotInsert } from '../../types/database.js';

export class TokenPriceDmaWriter extends BaseDmaWriter<TokenPriceDmaSnapshotInsert> {
  protected readonly dmaConfig: DmaWriterConfig<TokenPriceDmaSnapshotInsert> = {
    tableKey: 'TOKEN_PRICE_DMA_SNAPSHOTS',
    conflictColumn: 'token_symbol',
    sourceLiteral: 'coingecko',
    logLabel: 'DMA snapshots',
    buildInsertValues: buildTokenPriceDmaInsertValues,
  };
}
