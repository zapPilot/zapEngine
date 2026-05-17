/**
 * Stock Price DMA Writer
 *
 * Writes 200-day moving average snapshots with upsert semantics.
 * Upserts on (source, symbol, snapshot_date) to allow re-computation.
 *
 * Target: stock_price_dma_snapshots table
 */

import {
  BaseDmaWriter,
  type DmaWriterConfig,
} from '../../core/database/baseDmaWriter.js';
import { buildStockPriceDmaInsertValues } from '../../core/database/columnDefinitions.js';
import type { StockPriceDmaSnapshotInsert } from '../../modules/stock-price/dmaService.js';

export class StockPriceDmaWriter extends BaseDmaWriter<StockPriceDmaSnapshotInsert> {
  protected readonly dmaConfig: DmaWriterConfig<StockPriceDmaSnapshotInsert> = {
    tableKey: 'STOCK_PRICE_DMA_SNAPSHOTS',
    conflictColumn: 'symbol',
    sourceLiteral: 'yahoo-finance',
    logLabel: 'Stock DMA snapshots',
    buildInsertValues: buildStockPriceDmaInsertValues,
  };
}
