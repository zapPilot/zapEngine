import { z } from 'zod';

import { MarketDataFreshnessSchema } from '../shared/market-freshness.js';
import { AssetAllocationSchema, TargetAllocationSchema } from './allocation.js';
import { BucketTransferSchema } from './bucket.js';
import {
  BacktestDecisionDetailsSchema,
  BacktestMarketPointSchema,
  BacktestSignalSchema,
  BacktestStrategyPortfolioSchema,
  BacktestWindowInfoSchema,
} from './backtesting.js';

export const DailySuggestionPortfolioSchema =
  BacktestStrategyPortfolioSchema.extend({
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
  allocation: TargetAllocationSchema,
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

/**
 * The model portfolio the suggestion follows: its own holdings after its last
 * bar and the rolling backtest window it was replayed over.
 */
export const DailySuggestionModelSchema = z.object({
  allocation: AssetAllocationSchema,
  window: BacktestWindowInfoSchema,
});

export const DailySuggestionContextSchema = z.object({
  market: BacktestMarketPointSchema,
  signal: BacktestSignalSchema,
  portfolio: DailySuggestionPortfolioSchema,
  target: DailySuggestionTargetSchema,
  strategy: DailySuggestionStrategyContextSchema,
  model: DailySuggestionModelSchema,
});

export const DailySuggestionResponseSchema = z.object({
  as_of: z.string(),
  config_id: z.string(),
  config_display_name: z.string(),
  strategy_id: z.string(),
  action: DailySuggestionActionSchema,
  context: DailySuggestionContextSchema,
  data_freshness: MarketDataFreshnessSchema.nullable().optional(),
});

export type DailySuggestionPortfolio = z.infer<
  typeof DailySuggestionPortfolioSchema
>;
export type DailySuggestionActionStatus = z.infer<
  typeof DailySuggestionActionStatusSchema
>;
export type DailySuggestionAction = z.infer<typeof DailySuggestionActionSchema>;
export type DailySuggestionTarget = z.infer<typeof DailySuggestionTargetSchema>;
export type DailySuggestionModel = z.infer<typeof DailySuggestionModelSchema>;
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
