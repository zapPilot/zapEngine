import { z } from 'zod';

export const PortfolioAllocationSchema = z.object({
  spot: z.number().min(0).max(1),
  stable: z.number().min(0).max(1),
});

export const AssetAllocationSchema = z.object({
  btc: z.number().min(0).max(1),
  eth: z.number().min(0).max(1),
  spy: z.number().min(0).max(1),
  stable: z.number().min(0).max(1),
  alt: z.number().min(0).max(1),
});

export type PortfolioAllocation = z.infer<typeof PortfolioAllocationSchema>;
export type AssetAllocation = z.infer<typeof AssetAllocationSchema>;

export type BacktestPortfolioAllocation = PortfolioAllocation;
export type BacktestAssetAllocation = AssetAllocation;
