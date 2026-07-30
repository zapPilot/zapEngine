import {
  BaseSnapshotWriter,
  type SnapshotWriterConfig,
} from '../../core/database/baseSnapshotWriter.js';
import { buildStockPriceInsertValues } from '../../core/database/columnDefinitions.js';
import { formatDateToYYYYMMDD } from '../../utils/dateUtils.js';
import type { DailyStockPrice, StockPriceData } from './schema.js';

type StockPriceRecord = DailyStockPrice | StockPriceData;

interface LatestStockPriceSnapshot {
  date: string;
  price: number;
  symbol: string;
}

export class StockPriceWriter extends BaseSnapshotWriter<
  StockPriceRecord,
  LatestStockPriceSnapshot
> {
  protected readonly snapshotConfig = {
    tableKey: 'STOCK_PRICE_SNAPSHOTS',
    entityColumn: 'symbol',
    entityContextKey: 'symbol',
    sourceLiteral: 'yahoo-finance',
    defaultEntity: 'SPY',
    logLabel: 'Stock price',
    insertFailureMessage: 'Failed to save stock price snapshot',
    latestMapFailureMessage: 'Failed to map latest stock snapshot',
    conflictUpdates: ['price_usd'],
    buildInsertValues: buildStockPriceInsertValues,
    getEntity: (data) => data.symbol,
    getSnapshotDate: (data) =>
      'date' in data ? data.date : formatDateToYYYYMMDD(data.timestamp),
    getPrice: (data) => data.priceUsd,
    getSource: (data) => data.source,
    getEntityIdentifier: (data) => ({ symbol: data.symbol }),
    getInsertFailureContext: (data, snapshotDate) => ({
      date: snapshotDate,
      symbol: data.symbol,
      price: data.priceUsd,
    }),
    mapLatestSnapshot: (row) => ({
      date: row.snapshot_date,
      price: Number.parseFloat(row.price_usd),
      symbol: String(row['symbol']),
    }),
  } satisfies SnapshotWriterConfig<StockPriceRecord, LatestStockPriceSnapshot>;
}
