import {
  ApiError,
  ApiResponse,
  ApiResult,
  DATA_SOURCES,
  DataSource,
  ErrorCode,
  ErrorContext,
  Nullable,
} from '@zapengine/types/api';
import { z } from 'zod';

export type {
  ApiError,
  ApiResponse,
  ApiResult,
  DataSource,
  ErrorCode,
  ErrorContext,
  Nullable,
};
export { DATA_SOURCES };

export const BaseJobMetadataSchema = z.object({
  userId: z.string().optional(),
  errorMessage: z.string().optional(),
});

export const WalletFetchJobMetadataSchema = BaseJobMetadataSchema.extend({
  jobType: z.literal('wallet_fetch'),
  walletAddress: z.string().min(1),
  userId: z.string().min(1),
});

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

export interface ETLJob {
  sources: DataSource[];
  tasks?: ETLJobTask[] | undefined;
  filters?:
    | {
        chains?: string[] | undefined;
        protocols?: string[] | undefined;
        minTvl?: number | undefined;
      }
    | undefined;
  metadata?: JobMetadata | undefined;
  createdAt: Date;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  jobId: string;
}

export type ETLOperation = 'current' | 'backfill';

export interface CurrentETLTask {
  source: DataSource;
  operation: 'current';
  filters?: ETLFilters | undefined;
}

export interface TokenPriceBackfillTask {
  source: 'token-price';
  operation: 'backfill';
  tokens: TokenBackfillConfig[];
}

export interface MacroFearGreedBackfillTask {
  source: 'macro-fear-greed';
  operation: 'backfill';
  startDate?: string | undefined;
}

export type BackfillETLTask =
  | TokenPriceBackfillTask
  | MacroFearGreedBackfillTask;

export type ETLJobTask = CurrentETLTask | BackfillETLTask;

export interface TokenBackfillConfig {
  tokenId: string;
  tokenSymbol: string;
  daysBack?: number | undefined;
}

export interface BackfillPayload {
  tokens: TokenBackfillConfig[];
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
  existing: number;
  fetched: number;
  inserted: number;
  duration: number;
}

export type BackfillResult = ApiResult<BackfillTokenResultData>;

export interface VipUser {
  user_id: string;
  wallet: string;
}

export interface VipUserWithActivity extends VipUser {
  last_activity_at: Nullable<string>;
  last_portfolio_update_at: Nullable<string>;
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

export interface SingleSourceWebhookPayload {
  source: DataSource;
  filters?: ETLFilters;
}

export interface MultiSourceWebhookPayload {
  sources: DataSource[];
  filters?: ETLFilters;
}

export type WebhookPayload =
  | SingleSourceWebhookPayload
  | MultiSourceWebhookPayload;

export interface ETLFilters {
  chains?: string[] | undefined;
  protocols?: string[] | undefined;
  minTvl?: number | undefined;
}

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
  apy: number;
  apy_base: Nullable<number>;
  apy_reward: Nullable<number>;
  volume_usd_1d: Nullable<number>;
  exposure: Nullable<string>;
  reward_tokens: Nullable<string[]>;
  pool_meta: Nullable<Record<string, unknown>>;
  source: string;
  raw_data: Nullable<Record<string, unknown>>;
}
