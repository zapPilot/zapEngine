import {
  MarketDashboardResponseSchema,
  MarketSnapshotSchema,
} from '@zapengine/types';
import { z } from 'zod';

import { createValidator } from '@/schemas/schemaUtils';

export const unifiedDashboardResponseSchema = z.any();

// Wire-format contract is owned by `@zapengine/types/api/marketDashboard` and
// kept in parity with the analytics-engine Pydantic model via
// `scripts/contracts/check_pydantic_parity.py`. Re-exported here under the
// historical names so existing frontend imports keep working.
export const marketSnapshotSchema = MarketSnapshotSchema;
export const marketDashboardResponseSchema = MarketDashboardResponseSchema;

export interface DrawdownAnalysis {
  enhanced?: {
    summary?: {
      max_drawdown_pct?: number;
      max_drawdown_date?: string;
      recovery_days?: number;
    };
  };
  underwater_recovery?: {
    underwater_data?: {
      drawdown_pct?: number;
      date?: string;
    }[];
  };
}

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
  drawdown_analysis?: DrawdownAnalysis;
  _metadata?: Record<string, unknown>;
}

export type MarketDashboardPoint = z.infer<typeof marketSnapshotSchema>;
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
