import { z } from 'zod';

export type DataSource =
  | 'defillama'
  | 'debank'
  | 'hyperliquid'
  | 'feargreed'
  | 'token-price'
  | 'stock-price';

export const DATA_SOURCES: readonly DataSource[] = [
  'defillama',
  'debank',
  'hyperliquid',
  'feargreed',
  'token-price',
  'stock-price',
] as const;

export type ApiResult<T, E = ApiError> =
  | { success: true; data: T }
  | { success: false; error: E };

export interface ApiError {
  code: ErrorCode;
  message: string;
  source: DataSource | 'system' | 'database';
  context?: ErrorContext;
  timestamp?: string;
}

export type ErrorCode =
  | 'RATE_LIMIT_EXCEEDED'
  | 'TIMEOUT'
  | 'NETWORK'
  | 'VALIDATION_ERROR'
  | 'API_ERROR'
  | 'DATABASE_ERROR'
  | 'INTERNAL_ERROR'
  | 'NOT_FOUND'
  | 'UNAUTHORIZED'
  | 'UNKNOWN';

export interface ErrorContext {
  jobId?: string;
  userId?: string;
  wallet?: string;
  source?: DataSource;
  endpoint?: string;
  [key: string]: unknown;
}

export type Nullable<T> = T | null;

// Base metadata for all jobs
export const BaseJobMetadataSchema = z.object({
  userId: z.string().optional(),
  errorMessage: z.string().optional(),
});

// Wallet fetch metadata requires jobType + walletAddress + userId
export const WalletFetchJobMetadataSchema = BaseJobMetadataSchema.extend({
  jobType: z.literal('wallet_fetch'),
  walletAddress: z.string().min(1),
  userId: z.string().min(1),
});

// Standard job metadata (no required wallet fields)
export const StandardJobMetadataSchema = BaseJobMetadataSchema.extend({
  jobType: z.undefined().optional(),
  walletAddress: z.string().optional(),
});

export const JobMetadataSchema = z.union([
  WalletFetchJobMetadataSchema,
  StandardJobMetadataSchema,
]);

export type JobMetadata = z.infer<typeof JobMetadataSchema>;
export type WalletFetchJobMetadata = z.infer<
  typeof WalletFetchJobMetadataSchema
>;

export interface ProcessUserResult<B, P> {
  success: boolean;
  balances?: B[];
  portfolioItems?: P[];
  error?: string;
  successfulWallet?: string;
}

export type ETLTrigger = 'scheduled' | 'manual' | 'webhook';
export type ETLJobStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface ETLJob {
  jobId: string;
  trigger: ETLTrigger;
  sources: DataSource[];
  filters?:
    | {
        chains?: string[] | undefined;
        protocols?: string[] | undefined;
        minTvl?: number | undefined;
      }
    | undefined;
  metadata?: JobMetadata | undefined;
  createdAt: Date;
  status: ETLJobStatus;
}

export interface TokenBackfillConfig {
  tokenId: string; // CoinGecko ID: 'bitcoin', 'ethereum'
  tokenSymbol: string; // Display symbol: 'BTC', 'ETH'
  daysBack?: number | undefined; // Optional override (default: 90)
}

export interface BackfillPayload {
  tokens: TokenBackfillConfig[];
  trigger: 'manual' | 'scheduled';
}

export interface BackfillDmaMetadata {
  dmaAttempted: boolean;
  dmaUpserted: number;
  dmaRetries: number;
  dmaSuccess: boolean;
  dmaError?: string | undefined;
}

export interface BackfillTokenResultData extends BackfillDmaMetadata {
  tokenSymbol: string;
  tokenId: string;
  requested: number;
  existing: number; // Days already in database (gap detection)
  fetched: number;
  inserted: number;
  duration: number;
}

export type BackfillResult = ApiResult<BackfillTokenResultData>;

export interface VipUser {
  user_id: string;
  wallet: string;
}

/**
 * VIP user with activity tracking timestamps
 * Used for activity-based update frequency filtering
 */
export interface VipUserWithActivity extends VipUser {
  last_activity_at: Nullable<string>; // When user last interacted (from account-engine)
  last_portfolio_update_at: Nullable<string>; // When portfolio data was last fetched (from alpha-etl)
}

export interface BaseBatchResult {
  success: boolean;
  recordsInserted: number;
  errors: string[];
}

export interface ETLProcessResult extends BaseBatchResult {
  recordsProcessed: number;
  source: DataSource;
}

export interface ETLJobResultData {
  jobId: string;
  status: 'completed' | 'partial' | 'failed';
  recordsProcessed: number;
  recordsInserted: number;
  sourceResults: Record<DataSource, ETLProcessResult>;
  duration: number;
  completedAt: Date;
  errors?: string[];
}

export type ETLJobResult = ApiResult<ETLJobResultData>;

export type WebhookTrigger = Extract<ETLTrigger, 'scheduled' | 'manual'>;

export interface SingleSourceWebhookPayload {
  trigger: WebhookTrigger;
  source: DataSource;
  filters?: ETLFilters;
}

export interface MultiSourceWebhookPayload {
  trigger: WebhookTrigger;
  sources: DataSource[];
  filters?: ETLFilters;
}

export type WebhookPayload =
  | SingleSourceWebhookPayload
  | MultiSourceWebhookPayload;

export interface ETLFilters {
  chains?: string[];
  protocols?: string[];
  minTvl?: number;
}

export type ApiResponse<T = unknown> = ApiResult<T> & { timestamp: string };

export interface SourceHealth {
  status: 'healthy' | 'unhealthy';
  details?: string;
  lastCheck?: string;
}

export type HealthCheckResponse = ApiResponse<{
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  database: boolean;
  uptime: number;
  cached: boolean;
  lastCheckedAt: Nullable<string>;
  message?: string;
  sources?: Record<DataSource, SourceHealth>;
}>;

export interface PoolData {
  pool_address: Nullable<string>;
  protocol_address: Nullable<string>;
  chain: string;
  protocol: string;
  symbol: string;
  underlying_tokens: Nullable<string[]>;
  tvl_usd: Nullable<number>;
  apy: number; // Required field
  apy_base: Nullable<number>;
  apy_reward: Nullable<number>;
  volume_usd_1d: Nullable<number>;
  exposure: Nullable<string>;
  reward_tokens: Nullable<string[]>;
  pool_meta: Nullable<Record<string, unknown>>;
  source: string;
  raw_data: Nullable<Record<string, unknown>>;
}
