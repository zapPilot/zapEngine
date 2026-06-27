import { z } from 'zod';

export const PositionSchema = z.object({
  chainId: z.number(),
  protocol: z.string(),
  asset: z.string(),
  tokenAddress: z.string().optional(),
  amount: z.string(),
  valueUsd: z.string(),
  weight: z.string(),
  pricingSource: z.string(),
});

export type Position = z.infer<typeof PositionSchema>;

export const TransactionSchema = z.object({
  chainId: z.number(),
  hash: z.string(),
  type: z.enum(['rebalance', 'deposit', 'withdraw', 'claim', 'swap']),
});

export type Transaction = z.infer<typeof TransactionSchema>;

export const BenchmarkSchema = z.object({
  name: z.string(),
  cumulativeReturn: z.string(),
});

export type Benchmark = z.infer<typeof BenchmarkSchema>;

export const CostsSchema = z.object({
  gasUsd: z.string(),
  slippageUsd: z.string(),
  protocolFeesUsd: z.string(),
  totalUsd: z.string(),
});

export type Costs = z.infer<typeof CostsSchema>;

export const SignatureSchema = z.object({
  signer: z.string(),
  signedAt: z.string(),
  messageHash: z.string(),
  signature: z.string(),
});

export type Signature = z.infer<typeof SignatureSchema>;

export const DailySnapshotSchema = z.object({
  schemaVersion: z.string(),
  strategyId: z.string(),
  strategyVersion: z.string(),
  date: z.string(),
  timestamp: z.string(),
  chainIds: z.array(z.number()),
  walletAddresses: z.array(z.string()),
  previousCid: z.string().nullable(),
  nav: z.object({
    usd: z.string(),
    eth: z.string().optional(),
    btc: z.string().optional(),
  }),
  performance: z.object({
    dailyReturn: z.string(),
    cumulativeReturn: z.string(),
    maxDrawdown: z.string(),
    volatility30d: z.string().optional(),
    sharpe: z.string().optional(),
    sortino: z.string().optional(),
  }),
  positions: z.array(PositionSchema),
  costs: CostsSchema,
  transactions: z.array(TransactionSchema),
  benchmarks: z.array(BenchmarkSchema),
  rebalanceLogCids: z.array(z.string()).optional(),
  signature: SignatureSchema.optional(),
});

export type DailySnapshot = z.infer<typeof DailySnapshotSchema>;

export const RebalanceAssetChangeSchema = z.object({
  asset: z.string(),
  weight: z.string(),
});

export type RebalanceAssetChange = z.infer<typeof RebalanceAssetChangeSchema>;

export const RebalanceLogSchema = z.object({
  rebalanceId: z.string(),
  strategyId: z.string(),
  timestamp: z.string(),
  reason: z.string(),
  before: z.array(RebalanceAssetChangeSchema),
  after: z.array(RebalanceAssetChangeSchema),
  transactions: z.array(
    z.object({
      chainId: z.number(),
      hash: z.string(),
    }),
  ),
  estimatedCostUsd: z.string(),
  actualCostUsd: z.string(),
});

export type RebalanceLog = z.infer<typeof RebalanceLogSchema>;

export const StrategySpecSchema = z.object({
  strategyId: z.string(),
  version: z.string(),
  startDate: z.string(),
  goal: z.string(),
  assets: z.array(z.string()),
  rebalanceFrequency: z.string(),
  allocationRules: z.array(z.string()),
  riskLimits: z.array(z.string()),
  costInclusions: z.array(z.string()),
  failureConditions: z.array(z.string()),
  changelog: z.array(
    z.object({
      version: z.string(),
      date: z.string(),
      change: z.string(),
    }),
  ),
});

export type StrategySpec = z.infer<typeof StrategySpecSchema>;

export const TrackRecordMetaSchema = z.object({
  schemaVersion: z.string(),
  strategyId: z.string(),
  strategyVersion: z.string(),
  latestSnapshotCid: z.string(),
  updatedAt: z.string(),
  officialSigner: z.string().optional(),
});

export type TrackRecordMeta = z.infer<typeof TrackRecordMetaSchema>;
