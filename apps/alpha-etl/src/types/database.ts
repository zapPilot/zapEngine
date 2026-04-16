import type { Nullable } from './index.js';

export interface PoolAprSnapshotInsert {
  pool_address: Nullable<string>;
  protocol_address: Nullable<string>;
  chain: string;
  protocol: string;
  symbol: string;
  symbols: Nullable<string[]>;
  underlying_tokens: Nullable<string[]>;
  tvl_usd: Nullable<number>;
  apr: number;
  apr_base: Nullable<number>;
  apr_reward: Nullable<number>;
  volume_usd_1d: Nullable<number>;
  exposure: Nullable<string>; // single, multi, stable - standardized
  reward_tokens: Nullable<string[]>;
  pool_meta: Nullable<Record<string, unknown>>;
  raw_data: Nullable<Record<string, unknown>>;
  source: string;
  snapshot_time: Nullable<string>;
}

/**
 * Relaxed insert shape aligned to alpha_raw.wallet_token_snapshots.
 * Keep most fields optional to avoid strict typecheck friction.
 */
export interface WalletBalanceSnapshotInsert {
  // Required identifiers
  user_wallet_address: string;
  token_address: Nullable<string>;
  chain: string;

  // Token info (optional)
  name?: Nullable<string>;
  symbol?: Nullable<string>;
  display_symbol?: Nullable<string>;
  optimized_symbol?: Nullable<string>;
  decimals?: Nullable<number>;
  logo_url?: Nullable<string>;
  protocol_id?: Nullable<string>;

  // Pricing/flags
  price?: Nullable<number>;
  price_24h_change?: Nullable<number>;
  is_verified?: Nullable<boolean>;
  is_core?: Nullable<boolean>;
  is_wallet?: Nullable<boolean>;

  // Time/supply
  time_at?: Nullable<number>;
  inserted_at?: Nullable<string>;
  total_supply?: Nullable<number>;
  credit_score?: Nullable<number>;

  // Amounts
  amount?: Nullable<number>;
  raw_amount?: Nullable<string | number>;
  raw_amount_hex_str?: Nullable<string>;

  // Optional misc fields for compatibility
  token_meta?: Nullable<Record<string, unknown>>;
  raw_data?: Nullable<Record<string, unknown>>;
  source?: Nullable<string>;
  snapshot_time?: Nullable<string>;

  // Allow passthrough extras safely
  [key: string]: unknown;
}

export interface HyperliquidVaultAprSnapshotInsert {
  source: string;
  vault_address: string;
  vault_name: string;
  leader_address: string;
  apr: number;
  apr_base: Nullable<number>;
  apr_reward: Nullable<number>;
  tvl_usd: Nullable<number>;
  total_followers: Nullable<number>;
  leader_commission: Nullable<number>;
  leader_fraction: Nullable<number>;
  is_closed: boolean;
  allow_deposits: boolean;
  pool_meta: Nullable<Record<string, unknown>>;
  raw_data: Nullable<Record<string, unknown>>;
  snapshot_time: string;
}

export interface PortfolioItemSnapshotInsert {
  wallet: string;
  chain: string;
  name: string;
  name_item: string;
  id_raw: string;
  asset_usd_value: number;
  detail: Record<string, unknown>;
  snapshot_at: string;
  has_supported_portfolio: boolean;
  site_url: string;
  asset_dict: Record<string, unknown>;
  asset_token_list: unknown[];
  detail_types: string[];
  pool: Record<string, unknown>;
  proxy_detail: Record<string, unknown>;
  debt_usd_value: number;
  net_usd_value: number;
  update_at: number;
}

export interface SentimentSnapshotInsert {
  sentiment_value: number;
  classification: string;
  source: string;
  snapshot_time: string;
  raw_data: Nullable<Record<string, unknown>>;
}

export interface TokenPriceDmaSnapshotInsert {
  token_symbol: string;
  token_id: string;
  snapshot_date: string; // 'YYYY-MM-DD'
  price_usd: number;
  dma_200: number | null; // NULL if < 200 days available
  price_vs_dma_ratio: number | null;
  is_above_dma: boolean | null;
  days_available: number;
  source: string;
  snapshot_time: string; // ISO timestamp
}

export interface TokenPairRatioDmaSnapshotInsert {
  base_token_symbol: string;
  base_token_id: string;
  quote_token_symbol: string;
  quote_token_id: string;
  snapshot_date: string; // 'YYYY-MM-DD'
  ratio_value: number;
  dma_200: number | null; // NULL if < 200 overlapping days available
  ratio_vs_dma_ratio: number | null;
  is_above_dma: boolean | null;
  days_available: number;
  source: string;
  snapshot_time: string; // ISO timestamp
}
