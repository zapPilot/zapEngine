import { describe, expect, it } from 'vitest';

import {
  BenchmarkSchema,
  CostsSchema,
  DailySnapshotSchema,
  PositionSchema,
  RebalanceAssetChangeSchema,
  RebalanceLogSchema,
  SignatureSchema,
  StrategySpecSchema,
  TrackRecordMetaSchema,
  TransactionSchema,
} from '../../../src/strategy/track-record.js';

const position = {
  chainId: 8453,
  protocol: 'aave-v3',
  asset: 'USDC',
  amount: '1000000',
  valueUsd: '1.00',
  weight: '0.25',
  pricingSource: 'chainlink',
};

const costs = {
  gasUsd: '0.15',
  slippageUsd: '0.02',
  protocolFeesUsd: '0.01',
  totalUsd: '0.18',
};

const signature = {
  signer: '0x1111111111111111111111111111111111111111',
  signedAt: '2026-08-12T01:02:03.000Z',
  messageHash: '0xabc123',
  signature: '0xdeadbeef',
};

const fullSnapshot = {
  schemaVersion: '1.0.0',
  strategyId: 'strategy-1',
  strategyVersion: '2.1.0',
  date: '2026-08-12',
  timestamp: '2026-08-12T00:00:00.000Z',
  chainIds: [1, 8453],
  walletAddresses: [
    '0x1111111111111111111111111111111111111111',
    '0x2222222222222222222222222222222222222222',
  ],
  previousCid: 'bafy-previous',
  nav: {
    usd: '10000.00',
    eth: '2.50',
    btc: '0.10',
  },
  performance: {
    dailyReturn: '0.01',
    cumulativeReturn: '0.25',
    maxDrawdown: '-0.08',
    volatility30d: '0.12',
    sharpe: '1.75',
    sortino: '2.10',
  },
  positions: [{ ...position, tokenAddress: signature.signer }],
  costs,
  transactions: [
    {
      chainId: 8453,
      hash: '0xtransaction',
      type: 'rebalance',
    },
  ],
  benchmarks: [{ name: 'BTC', cumulativeReturn: '0.20' }],
  rebalanceLogCids: ['bafy-rebalance'],
  signature,
};

describe('PositionSchema', () => {
  it('accepts a position with a token address', () => {
    const result = PositionSchema.safeParse({
      ...position,
      tokenAddress: signature.signer,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tokenAddress).toBe(signature.signer);
    }
  });

  it('accepts a position without an optional token address', () => {
    const result = PositionSchema.safeParse(position);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tokenAddress).toBeUndefined();
    }
  });

  it('rejects a nonnumeric chain id', () => {
    expect(
      PositionSchema.safeParse({ ...position, chainId: '8453' }).success,
    ).toBe(false);
  });

  it('rejects a missing required pricing source', () => {
    const { pricingSource: _, ...withoutPricingSource } = position;

    expect(PositionSchema.safeParse(withoutPricingSource).success).toBe(false);
  });
});

describe('TransactionSchema', () => {
  it('accepts every supported transaction type', () => {
    for (const type of ['rebalance', 'deposit', 'withdraw', 'claim', 'swap']) {
      expect(
        TransactionSchema.safeParse({ chainId: 1, hash: '0xhash', type })
          .success,
      ).toBe(true);
    }
  });

  it('rejects an unsupported transaction type', () => {
    expect(
      TransactionSchema.safeParse({
        chainId: 1,
        hash: '0xhash',
        type: 'bridge',
      }).success,
    ).toBe(false);
  });

  it('rejects a transaction without a hash', () => {
    expect(
      TransactionSchema.safeParse({ chainId: 1, type: 'deposit' }).success,
    ).toBe(false);
  });
});

describe('BenchmarkSchema', () => {
  it('accepts a benchmark', () => {
    expect(
      BenchmarkSchema.safeParse({ name: 'ETH', cumulativeReturn: '0.15' })
        .success,
    ).toBe(true);
  });

  it('rejects a numeric cumulative return', () => {
    expect(
      BenchmarkSchema.safeParse({ name: 'ETH', cumulativeReturn: 0.15 })
        .success,
    ).toBe(false);
  });
});

describe('CostsSchema', () => {
  it('accepts a complete cost breakdown', () => {
    expect(CostsSchema.safeParse(costs).success).toBe(true);
  });

  it('rejects a missing cost component', () => {
    const { slippageUsd: _, ...withoutSlippage } = costs;

    expect(CostsSchema.safeParse(withoutSlippage).success).toBe(false);
  });

  it('rejects numeric cost values', () => {
    expect(CostsSchema.safeParse({ ...costs, totalUsd: 0.18 }).success).toBe(
      false,
    );
  });
});

describe('SignatureSchema', () => {
  it('accepts a complete signature', () => {
    expect(SignatureSchema.safeParse(signature).success).toBe(true);
  });

  it('rejects a signature without its signing timestamp', () => {
    const { signedAt: _, ...withoutSignedAt } = signature;

    expect(SignatureSchema.safeParse(withoutSignedAt).success).toBe(false);
  });
});

describe('DailySnapshotSchema', () => {
  it('accepts a fully-specified snapshot', () => {
    const result = DailySnapshotSchema.safeParse(fullSnapshot);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.nav).toEqual(fullSnapshot.nav);
      expect(result.data.performance).toEqual(fullSnapshot.performance);
      expect(result.data.rebalanceLogCids).toEqual(['bafy-rebalance']);
      expect(result.data.signature).toEqual(signature);
    }
  });

  it('accepts a minimal snapshot with nullable history and empty collections', () => {
    const result = DailySnapshotSchema.safeParse({
      ...fullSnapshot,
      chainIds: [],
      walletAddresses: [],
      previousCid: null,
      nav: { usd: '0' },
      performance: {
        dailyReturn: '0',
        cumulativeReturn: '0',
        maxDrawdown: '0',
      },
      positions: [],
      transactions: [],
      benchmarks: [],
      rebalanceLogCids: undefined,
      signature: undefined,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.previousCid).toBeNull();
      expect(result.data.nav.eth).toBeUndefined();
      expect(result.data.nav.btc).toBeUndefined();
      expect(result.data.performance.volatility30d).toBeUndefined();
      expect(result.data.performance.sharpe).toBeUndefined();
      expect(result.data.performance.sortino).toBeUndefined();
      expect(result.data.rebalanceLogCids).toBeUndefined();
      expect(result.data.signature).toBeUndefined();
    }
  });

  it('rejects an omitted previous snapshot CID', () => {
    const { previousCid: _, ...withoutPreviousCid } = fullSnapshot;

    expect(DailySnapshotSchema.safeParse(withoutPreviousCid).success).toBe(
      false,
    );
  });

  it('rejects a snapshot with a malformed position', () => {
    expect(
      DailySnapshotSchema.safeParse({
        ...fullSnapshot,
        positions: [{ ...position, valueUsd: 100 }],
      }).success,
    ).toBe(false);
  });

  it('rejects a snapshot with malformed costs', () => {
    expect(
      DailySnapshotSchema.safeParse({
        ...fullSnapshot,
        costs: { ...costs, gasUsd: 0.15 },
      }).success,
    ).toBe(false);
  });

  it('rejects a snapshot with an unsupported transaction type', () => {
    expect(
      DailySnapshotSchema.safeParse({
        ...fullSnapshot,
        transactions: [{ chainId: 1, hash: '0xhash', type: 'stake' }],
      }).success,
    ).toBe(false);
  });

  it('rejects a snapshot whose chain id collection contains strings', () => {
    expect(
      DailySnapshotSchema.safeParse({
        ...fullSnapshot,
        chainIds: ['8453'],
      }).success,
    ).toBe(false);
  });
});

describe('RebalanceAssetChangeSchema', () => {
  it('accepts an asset weight change', () => {
    expect(
      RebalanceAssetChangeSchema.safeParse({ asset: 'ETH', weight: '0.40' })
        .success,
    ).toBe(true);
  });

  it('rejects a numeric weight', () => {
    expect(
      RebalanceAssetChangeSchema.safeParse({ asset: 'ETH', weight: 0.4 })
        .success,
    ).toBe(false);
  });
});

describe('RebalanceLogSchema', () => {
  const rebalanceLog = {
    rebalanceId: 'rebalance-1',
    strategyId: 'strategy-1',
    timestamp: '2026-08-12T00:00:00.000Z',
    reason: 'Target weights drifted',
    before: [{ asset: 'ETH', weight: '0.30' }],
    after: [{ asset: 'ETH', weight: '0.40' }],
    transactions: [{ chainId: 8453, hash: '0xtransaction' }],
    estimatedCostUsd: '0.20',
    actualCostUsd: '0.18',
  };

  it('accepts a complete rebalance log', () => {
    expect(RebalanceLogSchema.safeParse(rebalanceLog).success).toBe(true);
  });

  it('accepts empty asset changes and transactions', () => {
    expect(
      RebalanceLogSchema.safeParse({
        ...rebalanceLog,
        before: [],
        after: [],
        transactions: [],
      }).success,
    ).toBe(true);
  });

  it('rejects a malformed before allocation', () => {
    expect(
      RebalanceLogSchema.safeParse({
        ...rebalanceLog,
        before: [{ asset: 'ETH', weight: 0.3 }],
      }).success,
    ).toBe(false);
  });

  it('rejects a transaction with a nonnumeric chain id', () => {
    expect(
      RebalanceLogSchema.safeParse({
        ...rebalanceLog,
        transactions: [{ chainId: '8453', hash: '0xtransaction' }],
      }).success,
    ).toBe(false);
  });
});

describe('StrategySpecSchema', () => {
  const strategySpec = {
    strategyId: 'strategy-1',
    version: '2.1.0',
    startDate: '2026-01-01',
    goal: 'Risk-adjusted growth',
    assets: ['ETH', 'USDC'],
    rebalanceFrequency: 'weekly',
    allocationRules: ['ETH <= 60%'],
    riskLimits: ['max drawdown 20%'],
    costInclusions: ['gas', 'slippage'],
    failureConditions: ['oracle unavailable'],
    changelog: [
      {
        version: '2.1.0',
        date: '2026-08-12',
        change: 'Reduced ETH ceiling',
      },
    ],
  };

  it('accepts a complete strategy specification', () => {
    expect(StrategySpecSchema.safeParse(strategySpec).success).toBe(true);
  });

  it('accepts empty list fields', () => {
    expect(
      StrategySpecSchema.safeParse({
        ...strategySpec,
        assets: [],
        allocationRules: [],
        riskLimits: [],
        costInclusions: [],
        failureConditions: [],
        changelog: [],
      }).success,
    ).toBe(true);
  });

  it('rejects a changelog entry missing its change description', () => {
    expect(
      StrategySpecSchema.safeParse({
        ...strategySpec,
        changelog: [{ version: '2.1.0', date: '2026-08-12' }],
      }).success,
    ).toBe(false);
  });

  it('rejects a nonstring asset', () => {
    expect(
      StrategySpecSchema.safeParse({ ...strategySpec, assets: ['ETH', 1] })
        .success,
    ).toBe(false);
  });
});

describe('TrackRecordMetaSchema', () => {
  const metadata = {
    schemaVersion: '1.0.0',
    strategyId: 'strategy-1',
    strategyVersion: '2.1.0',
    latestSnapshotCid: 'bafy-latest',
    updatedAt: '2026-08-12T01:02:03.000Z',
  };

  it('accepts metadata with an official signer', () => {
    const result = TrackRecordMetaSchema.safeParse({
      ...metadata,
      officialSigner: signature.signer,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.officialSigner).toBe(signature.signer);
    }
  });

  it('accepts metadata without an optional official signer', () => {
    const result = TrackRecordMetaSchema.safeParse(metadata);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.officialSigner).toBeUndefined();
    }
  });

  it('rejects metadata missing its latest snapshot CID', () => {
    const { latestSnapshotCid: _, ...withoutLatestSnapshotCid } = metadata;

    expect(
      TrackRecordMetaSchema.safeParse(withoutLatestSnapshotCid).success,
    ).toBe(false);
  });
});
