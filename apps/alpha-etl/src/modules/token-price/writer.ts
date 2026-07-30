import {
  BaseSnapshotWriter,
  type SnapshotWriterConfig,
} from '../../core/database/baseSnapshotWriter.js';
import { buildTokenPriceInsertValues } from '../../core/database/columnDefinitions.js';
import { formatDateToYYYYMMDD } from '../../utils/dateUtils.js';
import type { TokenPriceData } from './schema.js';

interface LatestTokenPriceSnapshot {
  date: string;
  price: number;
  tokenSymbol: string;
}

function normalizeSnapshotDateValue(snapshotDate: Date | string): Date {
  return snapshotDate instanceof Date ? snapshotDate : new Date(snapshotDate);
}

export class TokenPriceWriter extends BaseSnapshotWriter<
  TokenPriceData,
  LatestTokenPriceSnapshot
> {
  protected readonly snapshotConfig = {
    tableKey: 'TOKEN_PRICE_SNAPSHOTS',
    entityColumn: 'token_symbol',
    entityContextKey: 'tokenSymbol',
    sourceLiteral: 'coingecko',
    defaultEntity: 'BTC',
    logLabel: 'Token price',
    insertFailureMessage: 'Failed to save token price snapshot',
    latestMapFailureMessage: 'Failed to map latest token snapshot',
    conflictUpdates: [
      'price_usd',
      'market_cap_usd',
      'volume_24h_usd',
      'token_id',
      'snapshot_time',
      'raw_data',
    ],
    buildInsertValues: buildTokenPriceInsertValues,
    getEntity: (data) => data.tokenSymbol,
    getSnapshotDate: (data) => formatDateToYYYYMMDD(data.timestamp),
    getPrice: (data) => data.priceUsd,
    getSource: (data) => data.source,
    getEntityIdentifier: (data) => ({
      tokenSymbol: data.tokenSymbol,
      tokenId: data.tokenId,
    }),
    getInsertFailureContext: (data, snapshotDate) => ({
      date: snapshotDate,
      tokenSymbol: data.tokenSymbol,
      tokenId: data.tokenId,
      price: data.priceUsd,
    }),
    mapLatestSnapshot: (row) => ({
      date: formatDateToYYYYMMDD(normalizeSnapshotDateValue(row.snapshot_date)),
      price: Number.parseFloat(row.price_usd),
      tokenSymbol: String(row['token_symbol']),
    }),
  } satisfies SnapshotWriterConfig<TokenPriceData, LatestTokenPriceSnapshot>;
}
