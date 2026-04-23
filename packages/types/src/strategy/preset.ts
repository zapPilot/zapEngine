import { z } from 'zod';

import {
  BacktestCompareParamsV3Schema,
  BacktestStrategyCatalogEntryV3Schema,
} from './backtesting.js';

export const StrategyPresetSchema = z.object({
  config_id: z.string(),
  display_name: z.string(),
  description: z.string().nullable(),
  strategy_id: z.string(),
  params: BacktestCompareParamsV3Schema,
  is_default: z.boolean(),
  is_benchmark: z.boolean(),
});

export const BacktestDefaultsSchema = z.object({
  days: z.number().int(),
  total_capital: z.number(),
});

export const StrategyConfigsResponseSchema = z.object({
  strategies: z.array(BacktestStrategyCatalogEntryV3Schema),
  presets: z.array(StrategyPresetSchema),
  backtest_defaults: BacktestDefaultsSchema,
});

export type StrategyPreset = z.infer<typeof StrategyPresetSchema>;
export type BacktestDefaults = z.infer<typeof BacktestDefaultsSchema>;
export type StrategyConfigsResponse = z.infer<
  typeof StrategyConfigsResponseSchema
>;
