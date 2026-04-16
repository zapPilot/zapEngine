import { z } from "zod";

import { createValidator } from "@/schemas/schemaUtils";

const roiWindowSchema = z.object({
  value: z.number(),
  data_points: z.number(),
  start_balance: z.number().optional(),
});

const portfolioROISchema = z.object({
  recommended_roi: z.number(),
  recommended_period: z.string(),
  recommended_yearly_roi: z.number(),
  estimated_yearly_pnl_usd: z.number(),
  windows: z.record(z.string(), roiWindowSchema).optional(),
  roi_7d: roiWindowSchema.optional(),
  roi_30d: roiWindowSchema.optional(),
  roi_365d: roiWindowSchema.optional(),
  roi_windows: z.record(z.string(), z.number()).optional(),
});

const allocationCategorySchema = z.object({
  total_value: z.number(),
  percentage_of_portfolio: z.number(),
  wallet_tokens_value: z.number(),
  other_sources_value: z.number(),
});

const portfolioAllocationSchema = z.object({
  btc: allocationCategorySchema,
  eth: allocationCategorySchema,
  stablecoins: allocationCategorySchema,
  others: allocationCategorySchema,
});

const poolDetailSchema = z.object({
  wallet: z.string(),
  protocol_id: z.string(),
  protocol: z.string(),
  protocol_name: z.string(),
  chain: z.string(),
  asset_usd_value: z.number(),
  pool_symbols: z.array(z.string()),
  contribution_to_portfolio: z.number(),
  snapshot_id: z.string(),
  snapshot_ids: z.array(z.string()).nullable().optional(),
});

const riskMetricsSchema = z.object({
  has_leverage: z.boolean(),
  health_rate: z.number().positive(),
  leverage_ratio: z.number().positive(),
  collateral_value_usd: z.number().nonnegative(),
  debt_value_usd: z.number().nonnegative(),
  liquidation_threshold: z.number().positive(),
  protocol_source: z.string(),
  position_count: z.number().int().nonnegative(),
});

const borrowingSummarySchema = z.object({
  has_debt: z.boolean(),
  worst_health_rate: z.number().positive().nullable(),
  overall_status: z.enum(["HEALTHY", "WARNING", "CRITICAL"]).nullable(),
  critical_count: z.number().int().nonnegative(),
  warning_count: z.number().int().nonnegative(),
  healthy_count: z.number().int().nonnegative(),
});

const tokenDetailSchema = z.object({
  symbol: z.string(),
  amount: z.number(),
  value_usd: z.number().nonnegative(),
});

const borrowingPositionSchema = z.object({
  protocol_id: z.string(),
  protocol_name: z.string(),
  chain: z.string(),
  health_rate: z.number().positive(),
  health_status: z.enum(["HEALTHY", "WARNING", "CRITICAL"]),
  collateral_usd: z.number().nonnegative(),
  debt_usd: z.number().positive(),
  net_value_usd: z.number(),
  collateral_tokens: z.array(tokenDetailSchema),
  debt_tokens: z.array(tokenDetailSchema),
  updated_at: z.string(),
});

const defaultAprCoverage = {
  matched_pools: 0,
  total_pools: 0,
  coverage_percentage: 0,
  matched_asset_value_usd: 0,
} as const;

const aprCoverageSchema = z.object({
  matched_pools: z.number().default(0),
  total_pools: z.number().default(0),
  coverage_percentage: z.number().default(0),
  matched_asset_value_usd: z.number().default(0),
});

export const borrowingPositionsResponseSchema = z.object({
  positions: z.array(borrowingPositionSchema),
  total_collateral_usd: z.number().nonnegative(),
  total_debt_usd: z.number().positive(),
  worst_health_rate: z.number().positive(),
  last_updated: z.string(),
});

export const landingPageResponseSchema = z
  .object({
    total_assets_usd: z.number().optional(),
    total_debt_usd: z.number().optional(),
    total_net_usd: z.number().describe("Previously total_net_usd"),
    net_portfolio_value: z.number().nullable().optional().default(0),
    positions: z.number().optional().default(0),
    protocols: z.number().optional().default(0),
    chains: z.number().optional().default(0),
    portfolio_allocation: portfolioAllocationSchema,
    portfolio_roi: portfolioROISchema.optional(),
    pool_details: z.array(z.any()).optional(),
    wallet_token_summary: z.any().optional(),
    category_summary_debt: z.any().optional(),
    wallet_count: z.number().int().nonnegative().optional().default(0),
    last_updated: z.string().nullable().optional(),
    message: z.string().optional(),
    apr_coverage: aprCoverageSchema.optional().default(defaultAprCoverage),
    risk_metrics: riskMetricsSchema.nullable().optional(),
    borrowing_summary: borrowingSummarySchema.nullable().optional(),
  })
  .catchall(z.unknown());

export const poolPerformanceResponseSchema = z.array(poolDetailSchema);

export type LandingPageResponse = z.infer<typeof landingPageResponseSchema>;
export type RiskMetrics = z.infer<typeof riskMetricsSchema>;
export type BorrowingSummary = z.infer<typeof borrowingSummarySchema>;
export type BorrowingPosition = z.infer<typeof borrowingPositionSchema>;
export type BorrowingPositionsResponse = z.infer<
  typeof borrowingPositionsResponseSchema
>;
export type PoolDetail = z.infer<typeof poolDetailSchema>;

export const validateBorrowingPositionsResponse = createValidator(
  borrowingPositionsResponseSchema
);
export const validateLandingPageResponse = createValidator(
  landingPageResponseSchema
);
export const validatePoolPerformanceResponse = createValidator(
  poolPerformanceResponseSchema
);
