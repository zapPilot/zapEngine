import type { TokenPriceData } from '../../modules/token-price/schema.js';
import type {
  HyperliquidVaultAprSnapshotInsert,
  MacroFearGreedSnapshotInsert,
  PoolAprSnapshotInsert,
  PortfolioItemSnapshotInsert,
  SentimentSnapshotInsert,
  TokenPairRatioDmaSnapshotInsert,
  TokenPriceDmaSnapshotInsert,
  WalletBalanceSnapshotInsert,
} from '../../types/database.js';
import { formatDateToYYYYMMDD } from '../../utils/dateUtils.js';
import { buildGenericInsertValues } from './columnHelpers.js';

interface InsertValuesResult<K extends string> {
  columns: readonly K[];
  placeholders: string;
  values: unknown[];
}

type InsertValueTransformer<T, K extends keyof T & string> = (
  column: K,
  value: T[K],
  record: T,
) => unknown;

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

function toNullishSqlValue(value: unknown): unknown {
  return value ?? null;
}

function serializeJson(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function buildInsertValuesFor<T, K extends keyof T & string>(
  records: readonly T[],
  columns: readonly K[],
  valueTransformer?: InsertValueTransformer<T, K>,
): InsertValuesResult<K> {
  return buildGenericInsertValues(records, columns, valueTransformer);
}

function buildNullableInsertValuesFor<T, K extends keyof T & string>(
  records: readonly T[],
  columns: readonly K[],
): InsertValuesResult<K> {
  return buildInsertValuesFor(records, columns, (_column, value) =>
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

/**
 * Centralized column definitions and insert helpers for database writers.
 */
export const POOL_APR_COLUMNS: readonly (keyof PoolAprSnapshotInsert)[] = [
  'pool_address',
  'protocol_address',
  'chain',
  'protocol',
  'symbol',
  'symbols',
  'underlying_tokens',
  'tvl_usd',
  'apr',
  'apr_base',
  'apr_reward',
  'volume_usd_1d',
  'exposure',
  'reward_tokens',
  'pool_meta',
  'raw_data',
  'source',
  'snapshot_time',
] as const;

export function buildPoolInsertValues(
  records: PoolAprSnapshotInsert[],
): InsertValuesResult<keyof PoolAprSnapshotInsert & string> {
  return buildInsertValuesFor(records, POOL_APR_COLUMNS, (column, value) => {
    if (column === 'snapshot_time' && value == null) {
      return new Date().toISOString();
    }
    return toNullishSqlValue(value);
  });
}

export const WALLET_BALANCE_COLUMNS = [
  'user_wallet_address',
  'token_address',
  'chain',
  'name',
  'symbol',
  'display_symbol',
  'optimized_symbol',
  'decimals',
  'logo_url',
  'protocol_id',
  'price',
  'price_24h_change',
  'is_verified',
  'is_core',
  'is_wallet',
  'time_at',
  'total_supply',
  'credit_score',
  'amount',
  'raw_amount',
  'raw_amount_hex_str',
] as const;

export type WalletBalanceColumn = (typeof WALLET_BALANCE_COLUMNS)[number];

export function buildInsertValues(
  records: WalletBalanceSnapshotInsert[],
  columns: readonly WalletBalanceColumn[] = WALLET_BALANCE_COLUMNS,
): InsertValuesResult<WalletBalanceColumn> {
  return buildInsertValuesFor(records, columns);
}

export const PORTFOLIO_ITEM_COLUMNS: readonly (keyof PortfolioItemSnapshotInsert)[] =
  [
    'wallet',
    'chain',
    'name',
    'name_item',
    'id_raw',
    'asset_usd_value',
    'detail',
    'snapshot_at',
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

export type PortfolioItemColumn = (typeof PORTFOLIO_ITEM_COLUMNS)[number];

const PORTFOLIO_JSON_COLUMNS = new Set<PortfolioItemColumn>([
  'detail',
  'asset_dict',
  'asset_token_list',
  'pool',
  'proxy_detail',
]);

export function buildPortfolioInsertValues(
  records: PortfolioItemSnapshotInsert[],
): InsertValuesResult<PortfolioItemColumn> {
  return buildInsertValuesFor(
    records,
    PORTFOLIO_ITEM_COLUMNS,
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
  return buildInsertValuesFor(records, SENTIMENT_COLUMNS);
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
  return buildInsertValuesFor(
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
  return buildInsertValuesFor(records, HYPERLIQUID_VAULT_APR_COLUMNS);
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
  return buildInsertValuesFor(mappedRecords, TOKEN_PRICE_COLUMNS);
}
