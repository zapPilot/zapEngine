import { z } from 'zod';

import { BacktestStrategyCatalogEntryV3Schema } from './backtesting.js';
import { JsonObjectSchema } from './json.js';

export const StrategyPresetSchema = z.object({
  config_id: z.string(),
  display_name: z.string(),
  description: z.string().nullable(),
  strategy_id: z.string(),
  params: JsonObjectSchema,
  is_default: z.boolean(),
  is_benchmark: z.boolean(),
});

export const BacktestDefaultsSchema = z.object({
  days: z.number().int(),
  total_capital: z.number(),
});

export const PortfolioRuleMetadataSchema = z.object({
  name: z.string(),
  priority: z.number().int(),
  description: z.string(),
  default_enabled: z.boolean(),
});

export const StrategyConfigsResponseSchema = z.object({
  strategies: z.array(BacktestStrategyCatalogEntryV3Schema),
  presets: z.array(StrategyPresetSchema),
  backtest_defaults: BacktestDefaultsSchema,
  portfolio_rules: z.array(PortfolioRuleMetadataSchema).optional(),
});

export type StrategyPreset = z.infer<typeof StrategyPresetSchema>;
export type BacktestDefaults = z.infer<typeof BacktestDefaultsSchema>;
export type PortfolioRuleMetadata = z.infer<typeof PortfolioRuleMetadataSchema>;
export type StrategyConfigsResponse = z.infer<
  typeof StrategyConfigsResponseSchema
>;
