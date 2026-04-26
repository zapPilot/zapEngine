import { z } from 'zod';

export const StaleFeatureInfoSchema = z.object({
  feature_name: z.string(),
  asset: z.string(),
  requested_date: z.string(),
  effective_date: z.string(),
  lag_days: z.number().int().nonnegative(),
});

export const MarketDataFreshnessSchema = z.object({
  requested_date: z.string(),
  effective_date: z.string(),
  missing_dates: z.array(z.string()),
  stale_features: z.array(StaleFeatureInfoSchema),
  max_lag_days: z.number().int().nonnegative(),
  is_stale: z.boolean(),
});

export type StaleFeatureInfo = z.infer<typeof StaleFeatureInfoSchema>;
export type MarketDataFreshness = z.infer<typeof MarketDataFreshnessSchema>;
