import { z } from 'zod';

import {
  AssetAllocationSchema,
  PortfolioAllocationSchema,
} from './allocation.js';
import { BucketTransferSchema } from './bucket.js';
import {
  BacktestDecisionDetailsSchema,
  BacktestMarketPointSchema,
  BacktestSignalSchema,
  BacktestSpotAssetSymbolSchema,
} from './backtesting.js';

export const DailySuggestionPortfolioSchema = z.object({
  spot_usd: z.number().nonnegative(),
  stable_usd: z.number().nonnegative(),
  total_value: z.number().nonnegative(),
  allocation: PortfolioAllocationSchema,
  asset_allocation: AssetAllocationSchema,
  spot_asset: BacktestSpotAssetSymbolSchema.nullable().optional(),
  total_assets_usd: z.number().nonnegative().optional(),
  total_debt_usd: z.number().nonnegative().optional(),
  total_net_usd: z.number().optional(),
});

export const DailySuggestionActionStatusSchema = z.enum([
  'action_required',
  'blocked',
  'no_action',
]);

export const DailySuggestionActionSchema = z.object({
  status: DailySuggestionActionStatusSchema,
  required: z.boolean(),
  kind: z.literal('rebalance').nullable(),
  reason_code: z.string(),
  transfers: z.array(BucketTransferSchema),
});

export const DailySuggestionTargetSchema = z.object({
  allocation: PortfolioAllocationSchema,
  asset_allocation: AssetAllocationSchema,
});

export const DailySuggestionStrategyContextSchema = z.object({
  stance: z.enum(['buy', 'sell', 'hold']),
  reason_code: z.string(),
  rule_group: z.enum([
    'cross',
    'cooldown',
    'dma_fgi',
    'ath',
    'rotation',
    'none',
  ]),
  details: BacktestDecisionDetailsSchema.optional(),
});

export const DailySuggestionContextSchema = z.object({
  market: BacktestMarketPointSchema,
  signal: BacktestSignalSchema,
  portfolio: DailySuggestionPortfolioSchema,
  target: DailySuggestionTargetSchema,
  strategy: DailySuggestionStrategyContextSchema,
});

export const DailySuggestionResponseSchema = z.object({
  as_of: z.string(),
  config_id: z.string(),
  config_display_name: z.string(),
  strategy_id: z.string(),
  action: DailySuggestionActionSchema,
  context: DailySuggestionContextSchema,
});

export type DailySuggestionPortfolio = z.infer<
  typeof DailySuggestionPortfolioSchema
>;
export type DailySuggestionActionStatus = z.infer<
  typeof DailySuggestionActionStatusSchema
>;
export type DailySuggestionAction = z.infer<typeof DailySuggestionActionSchema>;
export type DailySuggestionTarget = z.infer<typeof DailySuggestionTargetSchema>;
export type DailySuggestionStrategyContext = z.infer<
  typeof DailySuggestionStrategyContextSchema
>;
export type DailySuggestionContext = z.infer<
  typeof DailySuggestionContextSchema
>;
export type DailySuggestionResponse = z.infer<
  typeof DailySuggestionResponseSchema
>;
export type DailySuggestionData = DailySuggestionResponse;
