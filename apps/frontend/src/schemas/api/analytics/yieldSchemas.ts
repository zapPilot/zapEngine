import { z } from 'zod';

import { createValidator } from '@/schemas/schemaUtils';

export const protocolYieldWindowSchema = z.object({
  total_yield_usd: z.number(),
  average_daily_yield_usd: z.number(),
  data_points: z.number(),
  positive_days: z.number(),
  negative_days: z.number(),
});

export const protocolYieldTodaySchema = z.object({
  date: z.string(),
  yield_usd: z.number(),
});

export const protocolYieldBreakdownSchema = z.object({
  protocol: z.string(),
  chain: z.string().nullable().optional(),
  window: protocolYieldWindowSchema,
  today: protocolYieldTodaySchema.nullable().optional(),
});

const periodWindowSchema = z.object({
  start_date: z.string(),
  end_date: z.string(),
  days: z.number(),
});

export const yieldWindowSummarySchema = z.object({
  user_id: z.string(),
  period: periodWindowSchema,
  average_daily_yield_usd: z.number(),
  median_daily_yield_usd: z.number(),
  total_yield_usd: z.number(),
  statistics: z.object({
    mean: z.number(),
    median: z.number(),
    std_dev: z.number(),
    min_value: z.number(),
    max_value: z.number(),
    total_days: z.number(),
    filtered_days: z.number(),
    outliers_removed: z.number(),
  }),
  outlier_strategy: z.enum(['iqr', 'none', 'zscore', 'percentile']),
  outliers_detected: z.array(
    z.object({
      date: z.string(),
      value: z.number(),
      reason: z.string(),
      z_score: z.number().nullable(),
    }),
  ),
  protocol_breakdown: z.array(protocolYieldBreakdownSchema),
});

export const yieldReturnsSummaryResponseSchema = z.object({
  user_id: z.string(),
  windows: z.record(z.string(), yieldWindowSummarySchema),
  recommended_period: z.string().optional(),
});

const dailyYieldTokenSchema = z.object({
  symbol: z.string(),
  amount_change: z.number(),
  current_price: z.number(),
  yield_return_usd: z.number(),
});

const dailyYieldReturnSchema = z.object({
  date: z.string(),
  protocol_name: z.string(),
  chain: z.string(),
  position_type: z.string().nullable().optional(),
  yield_return_usd: z.number(),
  tokens: z.array(dailyYieldTokenSchema),
});

const dailyYieldPeriodSchema = periodWindowSchema;

export const dailyYieldReturnsResponseSchema = z.object({
  user_id: z.string(),
  period: dailyYieldPeriodSchema,
  daily_returns: z.array(dailyYieldReturnSchema),
});

export type DailyYieldReturnsResponse = z.infer<
  typeof dailyYieldReturnsResponseSchema
>;

export const validateYieldReturnsSummaryResponse = createValidator(
  yieldReturnsSummaryResponseSchema,
);
export const validateDailyYieldReturnsResponse = createValidator(
  dailyYieldReturnsResponseSchema,
);
