import { z } from 'zod';

import {
  AssetAllocationSchema,
  PortfolioAllocationSchema,
} from './allocation.js';
import { BucketTransferSchema } from './bucket.js';
import { JsonObjectSchema, JsonValueSchema, type JsonValue } from './json.js';
import { MarketDataFreshnessSchema } from '../shared/market-freshness.js';

export const BacktestSignalParamsV3Schema = z
  .object({
    cross_cooldown_days: z.number().optional(),
    cross_on_touch: z.boolean().optional(),
    rotation_neutral_band: z.number().optional(),
    rotation_max_deviation: z.number().optional(),
  })
  .partial();

export const BacktestPacingParamsV3Schema = z
  .object({
    k: z.number().optional(),
    r_max: z.number().optional(),
  })
  .partial();

export const BacktestBuyGateParamsV3Schema = z
  .object({
    window_days: z.number().optional(),
    sideways_max_range: z.number().optional(),
    leg_caps: z.array(z.number()).optional(),
  })
  .partial();

export const BacktestTradeQuotaParamsV3Schema = z
  .object({
    min_trade_interval_days: z.number().nullable().optional(),
    max_trades_7d: z.number().nullable().optional(),
    max_trades_30d: z.number().nullable().optional(),
  })
  .partial();

export const BacktestRotationParamsV3Schema = z
  .object({
    drift_threshold: z.number().optional(),
    cooldown_days: z.number().optional(),
  })
  .partial();

export const BacktestCompareParamsV3Schema = z
  .object({
    signal: BacktestSignalParamsV3Schema.optional(),
    pacing: BacktestPacingParamsV3Schema.optional(),
    buy_gate: BacktestBuyGateParamsV3Schema.optional(),
    trade_quota: BacktestTradeQuotaParamsV3Schema.optional(),
    rotation: BacktestRotationParamsV3Schema.optional(),
  })
  .catchall(JsonValueSchema);

export const BacktestCompareConfigV3Schema = z.object({
  config_id: z.string(),
  saved_config_id: z.string().nullable().optional(),
  strategy_id: z.string().nullable().optional(),
  params: BacktestCompareParamsV3Schema.optional(),
});

export const BacktestRequestSchema = z.object({
  token_symbol: z.string().optional(),
  start_date: z.string().nullable().optional(),
  end_date: z.string().nullable().optional(),
  days: z.number().int().nullable().optional(),
  total_capital: z.number().positive(),
  configs: z.array(BacktestCompareConfigV3Schema).min(1),
});

export const BacktestSpotAssetSymbolSchema = z.enum(['BTC', 'ETH']);

export const BacktestStrategyPortfolioSchema = z.object({
  spot_usd: z.number().nonnegative(),
  stable_usd: z.number().nonnegative(),
  total_value: z.number().nonnegative(),
  allocation: PortfolioAllocationSchema,
  asset_allocation: AssetAllocationSchema,
  spot_asset: BacktestSpotAssetSymbolSchema.nullable().optional(),
});

export const BacktestDmaSignalDetailsSchema = z
  .object({
    dma_200: z.number().nullable().optional(),
    distance: z.number().nullable().optional(),
    zone: z.enum(['above', 'below', 'at']).nullable().optional(),
    cross_event: z.enum(['cross_up', 'cross_down']).nullable().optional(),
    cooldown_active: z.boolean().nullable().optional(),
    cooldown_remaining_days: z.number().nullable().optional(),
    cooldown_blocked_zone: z.enum(['above', 'below']).nullable().optional(),
    fgi_slope: z.number().nullable().optional(),
  })
  .catchall(JsonValueSchema);

export const BacktestSignalDetailsSchema = z
  .object({
    ath_event: z
      .enum(['token_ath', 'portfolio_ath', 'both_ath'])
      .nullable()
      .optional(),
    dma: BacktestDmaSignalDetailsSchema.nullable().optional(),
  })
  .catchall(JsonValueSchema);

export const BacktestSignalSchema = z.object({
  id: z.string(),
  regime: z.string(),
  raw_value: z.number().nullable().optional(),
  confidence: z.number().min(0).max(1),
  details: BacktestSignalDetailsSchema.optional(),
});

export const BacktestDecisionDetailsSchema = z
  .object({
    allocation_name: z.string().nullable().optional(),
    target_spot_asset: BacktestSpotAssetSymbolSchema.nullable().optional(),
    risk_notes: z.array(z.string()).optional(),
    decision_score: z.number().optional(),
  })
  .catchall(JsonValueSchema);

export const BacktestRuleGroupSchema = z.enum([
  'cross',
  'cooldown',
  'dma_fgi',
  'ath',
  'rotation',
  'none',
]);

export const BacktestDecisionSchema = z.object({
  action: z.enum(['buy', 'sell', 'hold']),
  reason: z.string(),
  rule_group: BacktestRuleGroupSchema,
  target_allocation: PortfolioAllocationSchema,
  target_asset_allocation: AssetAllocationSchema,
  immediate: z.boolean(),
  details: BacktestDecisionDetailsSchema.optional(),
});

export const BacktestExecutionDiagnosticsSchema = z.object({
  plugins: z.record(z.string(), JsonObjectSchema.nullable()),
});

export const BacktestExecutionSchema = z.object({
  event: z.string().nullable(),
  transfers: z.array(BucketTransferSchema),
  blocked_reason: z.string().nullable(),
  status: z.enum(['action_required', 'blocked', 'no_action']).optional(),
  action_required: z.boolean().optional(),
  step_count: z.number().int().nonnegative(),
  steps_remaining: z.number().int().nonnegative(),
  interval_days: z.number().int().nonnegative(),
  diagnostics: BacktestExecutionDiagnosticsSchema.optional(),
});

export const BacktestStrategyPointSchema = z.object({
  portfolio: BacktestStrategyPortfolioSchema,
  signal: BacktestSignalSchema.nullable(),
  decision: BacktestDecisionSchema,
  execution: BacktestExecutionSchema,
});

export const BacktestStrategySetSchema = <T extends z.ZodType>(
  valueSchema: T,
): z.ZodRecord<z.ZodString, T> => z.record(z.string(), valueSchema);

export const BacktestMarketPointSchema = z.object({
  date: z.string(),
  token_price: z.record(z.string(), z.number()),
  sentiment: z.number().int().nullable(),
  sentiment_label: z.string().nullable(),
});

export const BacktestTimelinePointSchema = z.object({
  market: BacktestMarketPointSchema,
  strategies: BacktestStrategySetSchema(BacktestStrategyPointSchema),
});

export const BacktestPeriodInfoSchema = z.object({
  start_date: z.string(),
  end_date: z.string(),
  days: z.number().int().nonnegative(),
});

export const BacktestWindowInfoSchema = z.object({
  requested: BacktestPeriodInfoSchema,
  effective: BacktestPeriodInfoSchema,
  truncated: z.boolean(),
});

export const BacktestStrategySummarySchema = z.object({
  strategy_id: z.string(),
  display_name: z.string(),
  signal_id: z.string().nullable().optional(),
  total_invested: z.number().nonnegative(),
  final_value: z.number().nonnegative(),
  roi_percent: z.number(),
  trade_count: z.number().int().nonnegative(),
  final_allocation: PortfolioAllocationSchema,
  final_asset_allocation: AssetAllocationSchema,
  max_drawdown_percent: z.number().optional(),
  calmar_ratio: z.number().optional(),
  parameters: JsonObjectSchema,
});

export const BacktestResponseSchema = z.object({
  strategies: BacktestStrategySetSchema(BacktestStrategySummarySchema),
  timeline: z.array(BacktestTimelinePointSchema),
  window: BacktestWindowInfoSchema.nullable().optional(),
  data_freshness: MarketDataFreshnessSchema.nullable().optional(),
});

export const BacktestStrategyCatalogEntryV3Schema = z.object({
  strategy_id: z.string(),
  display_name: z.string(),
  description: z.string().nullable().optional(),
  param_schema: JsonObjectSchema,
  default_params: BacktestCompareParamsV3Schema,
  supports_daily_suggestion: z.boolean(),
});

export const BacktestStrategyCatalogResponseV3Schema = z.object({
  catalog_version: z.string(),
  strategies: z.array(BacktestStrategyCatalogEntryV3Schema),
});

export type BacktestSignalParamsV3 = z.infer<
  typeof BacktestSignalParamsV3Schema
>;
export type BacktestPacingParamsV3 = z.infer<
  typeof BacktestPacingParamsV3Schema
>;
export type BacktestBuyGateParamsV3 = z.infer<
  typeof BacktestBuyGateParamsV3Schema
>;
export type BacktestTradeQuotaParamsV3 = z.infer<
  typeof BacktestTradeQuotaParamsV3Schema
>;
export type BacktestRotationParamsV3 = z.infer<
  typeof BacktestRotationParamsV3Schema
>;
export type BacktestCompareParamsV3 = z.infer<
  typeof BacktestCompareParamsV3Schema
>;
export type BacktestCompareConfigV3 = z.infer<
  typeof BacktestCompareConfigV3Schema
>;
export type BacktestRequest = z.infer<typeof BacktestRequestSchema>;
export type BacktestSpotAssetSymbol = z.infer<
  typeof BacktestSpotAssetSymbolSchema
>;
export type BacktestStrategyPortfolio = z.infer<
  typeof BacktestStrategyPortfolioSchema
>;
export type BacktestDmaSignalDetails = z.infer<
  typeof BacktestDmaSignalDetailsSchema
>;
export type BacktestSignalDetails = z.infer<typeof BacktestSignalDetailsSchema>;
export type BacktestSignal = z.infer<typeof BacktestSignalSchema>;
export type BacktestDecisionDetails = z.infer<
  typeof BacktestDecisionDetailsSchema
>;
export type BacktestDecision = z.infer<typeof BacktestDecisionSchema>;
export type BacktestExecutionDiagnostics = z.infer<
  typeof BacktestExecutionDiagnosticsSchema
>;
export type BacktestExecution = z.infer<typeof BacktestExecutionSchema>;
export type BacktestStrategyPoint = z.infer<typeof BacktestStrategyPointSchema>;
export type BacktestStrategySet<T> = Record<string, T>;
export type BacktestMarketPoint = z.infer<typeof BacktestMarketPointSchema>;
export type BacktestTimelinePoint = z.infer<typeof BacktestTimelinePointSchema>;
export type BacktestPeriodInfo = z.infer<typeof BacktestPeriodInfoSchema>;
export type BacktestWindowInfo = z.infer<typeof BacktestWindowInfoSchema>;
export type BacktestStrategySummary = z.infer<
  typeof BacktestStrategySummarySchema
>;
export type BacktestResponse = z.infer<typeof BacktestResponseSchema>;
export type BacktestStrategyCatalogEntryV3 = z.infer<
  typeof BacktestStrategyCatalogEntryV3Schema
>;
export type BacktestStrategyCatalogResponseV3 = z.infer<
  typeof BacktestStrategyCatalogResponseV3Schema
>;

export type BacktestJsonValue = JsonValue;
