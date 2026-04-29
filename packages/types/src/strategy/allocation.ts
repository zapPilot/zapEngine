import { z } from 'zod';

const AssetAllocationShape = {
  btc: z.number().min(0).max(1),
  eth: z.number().min(0).max(1),
  spy: z.number().min(0).max(1),
  stable: z.number().min(0).max(1),
  alt: z.number().min(0).max(1),
};

export const AssetAllocationSchema = z.object(AssetAllocationShape);

export const PortfolioAllocationSchema = z.object(AssetAllocationShape);

export const TargetAllocationSchema = AssetAllocationSchema.strict().refine(
  (allocation) => allocation.alt === 0,
  {
    message: 'target allocation cannot allocate to alt',
    path: ['alt'],
  },
);

export type PortfolioAllocation = z.infer<typeof PortfolioAllocationSchema>;
export type AssetAllocation = z.infer<typeof AssetAllocationSchema>;
export type TargetAllocation = z.infer<typeof TargetAllocationSchema>;

export type BacktestPortfolioAllocation = PortfolioAllocation;
export type BacktestAssetAllocation = AssetAllocation;
export type BacktestTargetAllocation = TargetAllocation;
