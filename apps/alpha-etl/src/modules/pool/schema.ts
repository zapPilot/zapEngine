import { z } from 'zod';

export const DeFiLlamaPoolSchema = z
  .object({
    pool: z.string(),
    chain: z.string(),
    project: z.string(),
    symbol: z.string(),
    tvlUsd: z.number(),
    apy: z.number().nullable().optional(),
    apyBase: z.number().nullable().optional(),
    apyReward: z.number().nullable().optional(),
    apyPct1D: z.number().nullable().optional(),
    apyPct7D: z.number().nullable().optional(),
    apyPct30D: z.number().nullable().optional(),
    stablecoin: z.boolean().optional(),
    ilRisk: z.string().optional(),
    exposure: z.string().optional(),
    poolMeta: z.string().nullable().optional(),
    mu: z.number().nullable().optional(),
    sigma: z.number().nullable().optional(),
    count: z.number().nullable().optional(),
    outlier: z.boolean().nullable().optional(),
    url: z.string().nullable().optional(),
    rewardTokens: z.array(z.string()).nullable().optional(),
    underlyingTokens: z.array(z.string()).nullable().optional(),
    volumeUsd1d: z.number().nullable().optional(),
  })
  .passthrough();

export const DeFiLlamaResponseSchema = z.object({
  status: z.string(),
  data: z.array(DeFiLlamaPoolSchema),
});
