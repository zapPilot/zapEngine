import { z } from 'zod';

import { createValidator } from '@/schemas/schemaUtils';

export const unifiedDashboardResponseSchema = z.any();

const ethBtcRelativeStrengthPointSchema = z.object({
  ratio: z.number(),
  dma_200: z.number().nullable(),
  is_above_dma: z.boolean().nullable(),
});

export const marketDashboardPointSchema = z.object({
  snapshot_date: z.string(),
  price_usd: z.number(),
  dma_200: z.number().nullable(),
  sentiment_value: z.number().nullable(),
  regime: z.enum(['ef', 'f', 'n', 'g', 'eg']).nullable(),
  eth_btc_relative_strength: ethBtcRelativeStrengthPointSchema
    .nullable()
    .optional(),
});

export const marketDashboardResponseSchema = z.object({
  snapshots: z.array(marketDashboardPointSchema),
  count: z.number(),
  token_symbol: z.string(),
  days_requested: z.number(),
  timestamp: z.string(),
});

export interface UnifiedDashboardResponse {
  user_id?: string;
  parameters?: Record<string, unknown>;
  trends?:
    | ({
        daily_values?: {
          date?: string;
          total_value_usd?: number;
          change_percentage?: number;
          pnl_percentage?: number;
          pnl_usd?: number;
          categories?: {
            category?: string;
            source_type?: string;
            value_usd?: number;
            pnl_usd?: number;
          }[];
          protocols?: {
            protocol?: string;
            chain?: string;
            source_type?: string;
            category?: string;
            value_usd?: number;
            pnl_usd?: number;
          }[];
          chains_count?: number;
        }[];
      } & Record<string, unknown>)
    | undefined;
  allocation?:
    | ({
        allocations?: {
          date?: string;
          category?: string;
          category_value_usd?: number;
          total_portfolio_value_usd?: number;
          allocation_percentage?: number;
        }[];
      } & Record<string, unknown>)
    | undefined;
  rolling_analytics?:
    | ({
        sharpe?:
          | ({
              rolling_sharpe_data?: {
                date?: string;
                rolling_sharpe_ratio?: number;
                is_statistically_reliable?: boolean;
              }[];
            } & Record<string, unknown>)
          | undefined;
        volatility?:
          | ({
              rolling_volatility_data?: {
                date?: string;
                rolling_volatility_pct?: number;
                annualized_volatility_pct?: number;
                rolling_volatility_daily_pct?: number;
              }[];
            } & Record<string, unknown>)
          | undefined;
      } & Record<string, unknown>)
    | undefined;
  drawdown_analysis?: Record<string, unknown>;
  _metadata?: Record<string, unknown>;
}

export type MarketDashboardPoint = z.infer<typeof marketDashboardPointSchema>;
export type MarketDashboardResponse = z.infer<
  typeof marketDashboardResponseSchema
>;

export const validateUnifiedDashboardResponse = createValidator(
  unifiedDashboardResponseSchema,
);
export const validateMarketDashboardResponse = createValidator(
  marketDashboardResponseSchema,
);

export const safeValidateUnifiedDashboardResponse = (
  data: unknown,
): ReturnType<typeof unifiedDashboardResponseSchema.safeParse> => {
  return unifiedDashboardResponseSchema.safeParse(data);
};
