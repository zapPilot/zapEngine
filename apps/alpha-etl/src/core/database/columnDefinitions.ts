import type { StockPriceDmaSnapshotInsert } from '../../modules/stock-price/dmaService.js';
import type {
  DailyStockPrice,
  StockPriceData,
} from '../../modules/stock-price/schema.js';
import type { TokenPriceData } from '../../modules/token-price/schema.js';
import type {
  DailyPortfolioPositionInsert,
  DailyWalletTokenInsert,
  HyperliquidVaultAprSnapshotInsert,
  MacroFearGreedSnapshotInsert,
  SentimentSnapshotInsert,
  TokenPairRatioDmaSnapshotInsert,
  TokenPriceDmaSnapshotInsert,
} from '../../types/database.js';
import { formatDateToYYYYMMDD } from '../../utils/dateUtils.js';
import { buildGenericInsertValues } from './columnHelpers.js';

interface InsertValuesResult<K extends string> {
  columns: readonly K[];
  placeholders: string;
  values: unknown[];
}

interface TokenPriceInsertRecord {
  price_usd: number;
  market_cap_usd: number;
  volume_24h_usd: number;
  source: string;
  token_symbol: string;
  token_id: string;
  snapshot_date: string;
  snapshot_time: Date;
  raw_data: string;
}

interface StockPriceInsertRecord {
  symbol: string;
  snapshot_date: string;
  price_usd: number;
  source: string;
  created_at: string;
}

function toNullishSqlValue(value: unknown): unknown {
  return value ?? null;
}

function serializeJson(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function buildNullableInsertValuesFor<T, K extends keyof T & string>(
  records: readonly T[],
  columns: readonly K[],
): InsertValuesResult<K> {
  return buildGenericInsertValues(records, columns, (_column, value) =>
    toNullishSqlValue(value),
  );
}

function mapTokenPriceRecord(record: TokenPriceData): TokenPriceInsertRecord {
  return {
    price_usd: record.priceUsd,
    market_cap_usd: record.marketCapUsd,
    volume_24h_usd: record.volume24hUsd,
    source: record.source,
    token_symbol: record.tokenSymbol,
    token_id: record.tokenId,
    snapshot_date: formatDateToYYYYMMDD(record.timestamp),
    snapshot_time: record.timestamp,
    raw_data: JSON.stringify(record),
  };
}

function mapStockPriceRecord(
  record: DailyStockPrice | StockPriceData,
): StockPriceInsertRecord {
  return {
    symbol: record.symbol,
    snapshot_date:
      'date' in record ? record.date : formatDateToYYYYMMDD(record.timestamp),
    price_usd: record.priceUsd,
    source: record.source,
    created_at: new Date().toISOString(),
  };
}

/**
 * Centralized column definitions and insert helpers for database writers.
 */
export const DAILY_WALLET_TOKEN_COLUMNS = [
  'user_wallet_address',
  'token_address',
  'chain',
  'symbol',
  'amount',
  'price',
  'snapshot_date',
] as const;

export type DailyWalletTokenColumn =
  (typeof DAILY_WALLET_TOKEN_COLUMNS)[number];

export function buildInsertValues(
  records: DailyWalletTokenInsert[],
  columns: readonly DailyWalletTokenColumn[] = DAILY_WALLET_TOKEN_COLUMNS,
): InsertValuesResult<DailyWalletTokenColumn> {
  return buildGenericInsertValues(records, columns);
}

export const DAILY_PORTFOLIO_POSITION_COLUMNS: readonly (keyof DailyPortfolioPositionInsert)[] =
  [
    'wallet',
    'chain',
    'name',
    'name_item',
    'id_raw',
    'asset_usd_value',
    'detail',
    'snapshot_at',
    'snapshot_date',
    'has_supported_portfolio',
    'site_url',
    'asset_dict',
    'asset_token_list',
    'detail_types',
    'pool',
    'proxy_detail',
    'debt_usd_value',
    'net_usd_value',
    'update_at',
  ] as const;

export type DailyPortfolioPositionColumn =
  (typeof DAILY_PORTFOLIO_POSITION_COLUMNS)[number];

const PORTFOLIO_JSON_COLUMNS = new Set<DailyPortfolioPositionColumn>([
  'detail',
  'asset_dict',
  'asset_token_list',
  'pool',
  'proxy_detail',
]);

export function buildPortfolioInsertValues(
  records: DailyPortfolioPositionInsert[],
): InsertValuesResult<DailyPortfolioPositionColumn> {
  return buildGenericInsertValues(
    records,
    DAILY_PORTFOLIO_POSITION_COLUMNS,
    (column, value) => {
      if (PORTFOLIO_JSON_COLUMNS.has(column)) {
        return serializeJson(value);
      }
      return toNullishSqlValue(value);
    },
  );
}

export const SENTIMENT_COLUMNS: readonly (keyof SentimentSnapshotInsert)[] = [
  'sentiment_value',
  'classification',
  'source',
  'snapshot_time',
  'raw_data',
] as const;

export function buildSentimentInsertValues(
  records: SentimentSnapshotInsert[],
): InsertValuesResult<keyof SentimentSnapshotInsert & string> {
  return buildGenericInsertValues(records, SENTIMENT_COLUMNS);
}

export const MACRO_FEAR_GREED_COLUMNS: readonly (keyof MacroFearGreedSnapshotInsert)[] =
  [
    'snapshot_date',
    'score',
    'label',
    'source',
    'provider_updated_at',
    'raw_rating',
    'raw_data',
  ] as const;

export function buildMacroFearGreedInsertValues(
  records: MacroFearGreedSnapshotInsert[],
): InsertValuesResult<keyof MacroFearGreedSnapshotInsert & string> {
  return buildGenericInsertValues(
    records,
    MACRO_FEAR_GREED_COLUMNS,
    (column, value) => {
      if (column === 'raw_data') {
        return serializeJson(value);
      }
      return toNullishSqlValue(value);
    },
  );
}

export const HYPERLIQUID_VAULT_APR_COLUMNS: readonly (keyof HyperliquidVaultAprSnapshotInsert)[] =
  [
    'source',
    'vault_address',
    'vault_name',
    'leader_address',
    'apr',
    'apr_base',
    'apr_reward',
    'tvl_usd',
    'total_followers',
    'leader_commission',
    'leader_fraction',
    'is_closed',
    'allow_deposits',
    'pool_meta',
    'raw_data',
    'snapshot_time',
  ] as const;

export function buildHyperliquidInsertValues(
  records: HyperliquidVaultAprSnapshotInsert[],
): InsertValuesResult<keyof HyperliquidVaultAprSnapshotInsert & string> {
  return buildGenericInsertValues(records, HYPERLIQUID_VAULT_APR_COLUMNS);
}

export const TOKEN_PRICE_DMA_COLUMNS: readonly (keyof TokenPriceDmaSnapshotInsert)[] =
  [
    'token_symbol',
    'token_id',
    'snapshot_date',
    'price_usd',
    'dma_200',
    'price_vs_dma_ratio',
    'is_above_dma',
    'days_available',
    'source',
    'snapshot_time',
  ] as const;

export function buildTokenPriceDmaInsertValues(
  records: TokenPriceDmaSnapshotInsert[],
): InsertValuesResult<keyof TokenPriceDmaSnapshotInsert & string> {
  return buildNullableInsertValuesFor(records, TOKEN_PRICE_DMA_COLUMNS);
}

export const TOKEN_PAIR_RATIO_DMA_COLUMNS: readonly (keyof TokenPairRatioDmaSnapshotInsert)[] =
  [
    'base_token_symbol',
    'base_token_id',
    'quote_token_symbol',
    'quote_token_id',
    'snapshot_date',
    'ratio_value',
    'dma_200',
    'ratio_vs_dma_ratio',
    'is_above_dma',
    'days_available',
    'source',
    'snapshot_time',
  ] as const;

export function buildTokenPairRatioDmaInsertValues(
  records: TokenPairRatioDmaSnapshotInsert[],
): InsertValuesResult<keyof TokenPairRatioDmaSnapshotInsert & string> {
  return buildNullableInsertValuesFor(records, TOKEN_PAIR_RATIO_DMA_COLUMNS);
}

export const TOKEN_PRICE_COLUMNS = [
  'price_usd',
  'market_cap_usd',
  'volume_24h_usd',
  'source',
  'token_symbol',
  'token_id',
  'snapshot_date',
  'snapshot_time',
  'raw_data',
] as const;

export type TokenPriceColumn = (typeof TOKEN_PRICE_COLUMNS)[number];

export function buildTokenPriceInsertValues(
  records: TokenPriceData[],
): InsertValuesResult<TokenPriceColumn> {
  const mappedRecords = records.map(mapTokenPriceRecord);
  return buildGenericInsertValues(mappedRecords, TOKEN_PRICE_COLUMNS);
}

export const STOCK_PRICE_COLUMNS = [
  'symbol',
  'snapshot_date',
  'price_usd',
  'source',
  'created_at',
] as const;

export type StockPriceColumn = (typeof STOCK_PRICE_COLUMNS)[number];

export function buildStockPriceInsertValues(
  records: (DailyStockPrice | StockPriceData)[],
): InsertValuesResult<StockPriceColumn> {
  const mappedRecords = records.map(mapStockPriceRecord);
  return buildGenericInsertValues(mappedRecords, STOCK_PRICE_COLUMNS);
}

export const STOCK_PRICE_DMA_COLUMNS: readonly (keyof StockPriceDmaSnapshotInsert)[] =
  [
    'symbol',
    'snapshot_date',
    'price_usd',
    'dma_200',
    'price_vs_dma_ratio',
    'is_above_dma',
    'days_available',
    'source',
    'snapshot_time',
    'created_at',
  ] as const;

export function buildStockPriceDmaInsertValues(
  records: StockPriceDmaSnapshotInsert[],
): InsertValuesResult<keyof StockPriceDmaSnapshotInsert & string> {
  return buildNullableInsertValuesFor(records, STOCK_PRICE_DMA_COLUMNS);
}
