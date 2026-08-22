import { z } from 'zod';

/**
 * Deliberately narrow view of the analytics daily-suggestion response.
 * Unknown fields are stripped so analytics can extend its payload without
 * coupling account-engine to the shared zod/pydantic contract.
 */

const nullableNumber = z.number().nullish();
const nullableString = z.string().nullish();
const cooldownFields = {
  cooldown_active: z.boolean().nullish(),
  cooldown_remaining_days: nullableNumber,
  cooldown_blocked_zone: nullableString,
};

const indicatorSchema = z
  .object({
    dma_200: nullableNumber,
    distance: nullableNumber,
    zone: nullableString,
    cross_event: nullableString,
    fgi_slope: nullableNumber,
    outer_dma_asset: nullableString,
    ...cooldownFields,
  })
  .nullish();

export const DailySuggestionSubsetSchema = z.object({
  as_of: z.string(),
  config_id: z.string(),
  config_display_name: z.string(),
  strategy_id: z.string(),
  action: z.object({
    status: z.string(),
    required: z.boolean(),
    reason_code: z.string(),
    transfers: z.array(
      z.object({
        from_bucket: z.string(),
        to_bucket: z.string(),
        amount_usd: z.number(),
      }),
    ),
  }),
  context: z.object({
    portfolio: z.object({
      total_value: z.number(),
      asset_allocation: z.record(z.string(), z.number()).nullish(),
      total_assets_usd: nullableNumber,
      total_debt_usd: nullableNumber,
      total_net_usd: nullableNumber,
    }),
    target: z.object({
      allocation: z.record(z.string(), z.number()),
    }),
    signal: z.object({
      regime: z.string(),
      details: z
        .object({
          ratio: z
            .object({
              ratio: nullableNumber,
              ratio_dma_200: nullableNumber,
              distance: nullableNumber,
              zone: nullableString,
              cross_event: nullableString,
              ...cooldownFields,
            })
            .nullish(),
          dma: indicatorSchema,
          spy_dma: indicatorSchema,
        })
        .nullish(),
    }),
    market: z
      .object({
        sentiment: nullableNumber,
        sentiment_label: nullableString,
        macro_fear_greed: z
          .object({ score: nullableNumber, label: nullableString })
          .nullish(),
      })
      .nullish(),
    strategy: z.object({
      details: z
        .object({
          matched_rule_name: nullableString,
          portfolio_rule_matches: z.array(z.string()).nullish(),
          cooldown_skipped_rules: z.array(z.string()).nullish(),
          enabled: z.boolean().nullish(),
          min_trade_interval_days: nullableNumber,
          max_trades_7d: nullableNumber,
          max_trades_30d: nullableNumber,
          trades_7d: nullableNumber,
          trades_30d: nullableNumber,
          days_since_last_trade: nullableNumber,
          last_trade_date: nullableString,
          next_trade_date: nullableString,
          block_reason: nullableString,
        })
        .nullish(),
    }),
  }),
});

export type DailySuggestionSubset = z.infer<typeof DailySuggestionSubsetSchema>;
