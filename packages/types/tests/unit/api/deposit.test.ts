import { describe, expect, it } from 'vitest';

import {
  AddressSchema,
  BASE_CHAIN_ID,
  BASE_USDC_ADDRESS,
  ChainSplitSchema,
  DEPOSIT_USDC_ADDRESSES,
  DEPOSIT_USDT_ADDRESSES,
  DestinationReplanStepSchema,
  DepositFollowUpSchema,
  DepositLegSchema,
  DepositPlanSchema,
  DepositRequestSchema,
  FollowUpAmountSchema,
  HexDataSchema,
  HYPERCORE_CHAIN_ID,
  HyperliquidVaultDepositStepSchema,
  MockBridgeCheckpointSchema,
  NATIVE_TOKEN_ADDRESS,
  PlanOrchestrationDepositPlanSchema,
  PlanOrchestrationDepositRequestSchema,
  PreparedTransactionSchema,
  StrategyAllocationSchema,
  StrategyChainExecutionGroupSchema,
  StrategyDepositPlanSchema,
  STRATEGY_DEPOSIT_ID,
  SUPPORTED_DEPOSIT_CHAINS,
} from '../../../src/api/deposit.js';
import { WithdrawPlanSchema } from '../../../src/api/withdraw.js';

const USER = '0x' + 'a'.repeat(40);
const VAULT = '0x' + 'b'.repeat(40);

describe('AddressSchema', () => {
  it('accepts canonical EVM addresses', () => {
    expect(AddressSchema.safeParse(USER).success).toBe(true);
  });

  it('rejects malformed addresses', () => {
    expect(AddressSchema.safeParse('0x123').success).toBe(false);
    expect(AddressSchema.safeParse('not-an-address').success).toBe(false);
  });
});

describe('HexDataSchema', () => {
  it('accepts even-length 0x-prefixed hex', () => {
    expect(HexDataSchema.safeParse('0x').success).toBe(true);
    expect(HexDataSchema.safeParse('0xdeadbeef').success).toBe(true);
  });

  it('rejects odd-length hex (must be byte-aligned)', () => {
    expect(HexDataSchema.safeParse('0xabc').success).toBe(false);
  });

  it('rejects missing 0x prefix', () => {
    expect(HexDataSchema.safeParse('deadbeef').success).toBe(false);
  });
});

describe('PreparedTransactionSchema', () => {
  const valid = {
    to: VAULT,
    data: '0xdeadbeef',
    value: '0',
    chainId: 8453,
    meta: { intentType: 'SUPPLY' },
  };

  it('accepts a minimal valid prepared tx', () => {
    expect(PreparedTransactionSchema.safeParse(valid).success).toBe(true);
  });

  it('passes through unknown meta keys', () => {
    const result = PreparedTransactionSchema.safeParse({
      ...valid,
      meta: { intentType: 'SUPPLY', someExtraKey: 'allowed' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects chainId 0 (must be positive)', () => {
    expect(
      PreparedTransactionSchema.safeParse({ ...valid, chainId: 0 }).success,
    ).toBe(false);
  });

  it('rejects non-integer chainId', () => {
    expect(
      PreparedTransactionSchema.safeParse({ ...valid, chainId: 8453.5 })
        .success,
    ).toBe(false);
  });

  it('rejects when value is not a decimal string', () => {
    expect(
      PreparedTransactionSchema.safeParse({ ...valid, value: '0x10' }).success,
    ).toBe(false);
  });

  it('requires meta.intentType', () => {
    expect(
      PreparedTransactionSchema.safeParse({
        ...valid,
        meta: { estimatedDuration: 5 },
      }).success,
    ).toBe(false);
  });
});

describe('DepositLegSchema', () => {
  it('accepts a supply leg', () => {
    const result = DepositLegSchema.safeParse({
      chainId: 8453,
      kind: 'supply',
      label: 'Morpho Moonwell USDC',
      toToken: VAULT,
      fromAmount: '1000000',
      toAmountMin: '990000',
      gasUsd: '0.42',
      durationSec: 12,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.label).toBe('Morpho Moonwell USDC');
    }
  });

  it('rejects an unsupported leg kind', () => {
    expect(
      DepositLegSchema.safeParse({
        chainId: 8453,
        kind: 'rebalance',
        toToken: VAULT,
        fromAmount: '1000000',
        toAmountMin: '990000',
        gasUsd: '0.42',
        durationSec: 12,
      }).success,
    ).toBe(false);
  });

  it('rejects negative durationSec', () => {
    expect(
      DepositLegSchema.safeParse({
        chainId: 8453,
        kind: 'supply',
        toToken: VAULT,
        fromAmount: '1000000',
        toAmountMin: '990000',
        gasUsd: '0.42',
        durationSec: -1,
      }).success,
    ).toBe(false);
  });
});

describe('DepositPlanSchema', () => {
  it('accepts a plan with empty legs and calls', () => {
    expect(
      DepositPlanSchema.safeParse({
        legs: [],
        approvals: [],
        calls: [],
        totalGasUsd: '0',
        sourceChainId: 8453,
      }).success,
    ).toBe(true);
  });

  it('rejects a plan missing the sourceChainId', () => {
    expect(
      DepositPlanSchema.safeParse({
        legs: [],
        approvals: [],
        calls: [],
        totalGasUsd: '0',
      } as unknown).success,
    ).toBe(false);
  });
});

describe('DepositRequestSchema (Base-only v1)', () => {
  it('accepts USDC on Base', () => {
    expect(
      DepositRequestSchema.safeParse({
        userAddress: USER,
        fromToken: BASE_USDC_ADDRESS,
        fromAmount: '1000000',
        sourceChainId: BASE_CHAIN_ID,
      }).success,
    ).toBe(true);
  });

  it('accepts native ETH on Base', () => {
    expect(
      DepositRequestSchema.safeParse({
        userAddress: USER,
        fromToken: NATIVE_TOKEN_ADDRESS,
        fromAmount: '1000000000000000000',
        sourceChainId: BASE_CHAIN_ID,
      }).success,
    ).toBe(true);
  });

  it('rejects Ethereum mainnet (only Base supported)', () => {
    const result = DepositRequestSchema.safeParse({
      userAddress: USER,
      fromToken: BASE_USDC_ADDRESS,
      fromAmount: '1000000',
      sourceChainId: SUPPORTED_DEPOSIT_CHAINS.ETHEREUM,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const chainIssue = result.error.issues.find((i) =>
        i.path.includes('sourceChainId'),
      );
      expect(chainIssue?.message).toBe('Deposit v1 supports Base only');
    }
  });

  it('rejects an unsupported token on Base', () => {
    const result = DepositRequestSchema.safeParse({
      userAddress: USER,
      fromToken: VAULT, // not USDC, not native
      fromAmount: '1000000',
      sourceChainId: BASE_CHAIN_ID,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const tokenIssue = result.error.issues.find((i) =>
        i.path.includes('fromToken'),
      );
      expect(tokenIssue?.message).toMatch(/USDC and native ETH on Base/);
    }
  });
});

describe('PlanOrchestrationDepositRequestSchema (discriminated union)', () => {
  it('accepts a chain-aware fixed strategy request', () => {
    expect(
      PlanOrchestrationDepositRequestSchema.safeParse({
        kind: 'strategy',
        strategyId: STRATEGY_DEPOSIT_ID,
        userAddress: USER,
        totalUsd6: '100000000',
        fundingSources: [
          {
            chainId: SUPPORTED_DEPOSIT_CHAINS.BASE,
            fromToken: BASE_USDC_ADDRESS,
          },
          {
            chainId: SUPPORTED_DEPOSIT_CHAINS.ARBITRUM,
            fromToken:
              DEPOSIT_USDC_ADDRESSES[SUPPORTED_DEPOSIT_CHAINS.ARBITRUM],
          },
        ],
      }).success,
    ).toBe(true);
  });

  it('rejects a strategy request with a noncanonical funding token', () => {
    const result = PlanOrchestrationDepositRequestSchema.safeParse({
      kind: 'strategy',
      strategyId: STRATEGY_DEPOSIT_ID,
      userAddress: USER,
      totalUsd6: '100000000',
      fundingSources: [
        {
          chainId: SUPPORTED_DEPOSIT_CHAINS.BASE,
          fromToken: VAULT,
        },
        {
          chainId: SUPPORTED_DEPOSIT_CHAINS.ARBITRUM,
          fromToken: DEPOSIT_USDC_ADDRESSES[SUPPORTED_DEPOSIT_CHAINS.ARBITRUM],
        },
      ],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some(
          (issue) =>
            issue.path.join('.') === 'fundingSources.0.fromToken' &&
            issue.message.includes('canonical USDC'),
        ),
      ).toBe(true);
    }
  });

  it('enforces the $10 strategy minimum at the exact boundary', () => {
    const request = (totalUsd6: string) => ({
      kind: 'strategy',
      strategyId: STRATEGY_DEPOSIT_ID,
      userAddress: USER,
      totalUsd6,
      fundingSources: [
        {
          chainId: SUPPORTED_DEPOSIT_CHAINS.BASE,
          fromToken: BASE_USDC_ADDRESS,
        },
        {
          chainId: SUPPORTED_DEPOSIT_CHAINS.ARBITRUM,
          fromToken: DEPOSIT_USDC_ADDRESSES[SUPPORTED_DEPOSIT_CHAINS.ARBITRUM],
        },
      ],
    });

    expect(
      PlanOrchestrationDepositRequestSchema.safeParse(request('10000000'))
        .success,
    ).toBe(true);

    const below = PlanOrchestrationDepositRequestSchema.safeParse(
      request('9999999'),
    );
    expect(below.success).toBe(false);
    if (!below.success) {
      expect(below.error.issues[0]?.message).toMatch(/at least \$10/);
    }
  });

  it('rejects a strategy request with reversed funding chains', () => {
    expect(
      PlanOrchestrationDepositRequestSchema.safeParse({
        kind: 'strategy',
        strategyId: STRATEGY_DEPOSIT_ID,
        userAddress: USER,
        totalUsd6: '100000000',
        fundingSources: [
          {
            chainId: SUPPORTED_DEPOSIT_CHAINS.ARBITRUM,
            fromToken:
              DEPOSIT_USDC_ADDRESSES[SUPPORTED_DEPOSIT_CHAINS.ARBITRUM],
          },
          {
            chainId: SUPPORTED_DEPOSIT_CHAINS.BASE,
            fromToken: BASE_USDC_ADDRESS,
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('accepts a v1 invest request with Base USDC', () => {
    expect(
      PlanOrchestrationDepositRequestSchema.safeParse({
        kind: 'invest',
        userAddress: USER,
        fromToken: BASE_USDC_ADDRESS,
        fromAmount: '1000000',
        sourceChainId: BASE_CHAIN_ID,
      }).success,
    ).toBe(true);
  });

  it.each([
    DEPOSIT_USDC_ADDRESSES[SUPPORTED_DEPOSIT_CHAINS.ARBITRUM],
    DEPOSIT_USDT_ADDRESSES[SUPPORTED_DEPOSIT_CHAINS.ARBITRUM],
    NATIVE_TOKEN_ADDRESS,
  ])('accepts a supported Arbitrum GMX funding token %s', (fromToken) => {
    expect(
      PlanOrchestrationDepositRequestSchema.safeParse({
        kind: 'gmx-v2',
        marketKey: 'btc-usdc',
        fromToken,
        amount: '1000000',
        userAddress: USER,
      }).success,
    ).toBe(true);
  });

  it('accepts the four-pool Arbitrum GMX basket request', () => {
    expect(
      PlanOrchestrationDepositRequestSchema.safeParse({
        kind: 'gmx-v2-basket',
        fromToken: DEPOSIT_USDC_ADDRESSES[SUPPORTED_DEPOSIT_CHAINS.ARBITRUM],
        amount: '1000000',
        userAddress: USER,
      }).success,
    ).toBe(true);
  });

  it('rejects gmx-v2 with an unknown marketKey', () => {
    expect(
      PlanOrchestrationDepositRequestSchema.safeParse({
        kind: 'gmx-v2',
        marketKey: 'doge-usdc',
        fromToken: DEPOSIT_USDC_ADDRESSES[SUPPORTED_DEPOSIT_CHAINS.ARBITRUM],
        amount: '1000000',
        userAddress: USER,
      }).success,
    ).toBe(false);
  });

  it.each(['gmx-v2', 'gmx-v2-basket'] as const)(
    'rejects an unsupported GMX funding token for %s',
    (kind) => {
      const result = PlanOrchestrationDepositRequestSchema.safeParse({
        kind,
        ...(kind === 'gmx-v2' ? { marketKey: 'btc-usdc' } : {}),
        fromToken: BASE_USDC_ADDRESS,
        amount: '1000000',
        userAddress: USER,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(
          result.error.issues.some((issue) => issue.path.includes('fromToken')),
        ).toBe(true);
      }
    },
  );

  it('rejects a Base-chain token on a different source chain', () => {
    const result = PlanOrchestrationDepositRequestSchema.safeParse({
      kind: 'invest',
      userAddress: USER,
      fromToken: BASE_USDC_ADDRESS, // Base USDC is not Ethereum USDC
      fromAmount: '1000000',
      sourceChainId: SUPPORTED_DEPOSIT_CHAINS.ETHEREUM,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) => issue.path.includes('fromToken')),
      ).toBe(true);
    }
  });

  it('accepts a destination re-quote: Arbitrum source with Arbitrum USDC and a single-chain split', () => {
    expect(
      PlanOrchestrationDepositRequestSchema.safeParse({
        kind: 'invest',
        userAddress: USER,
        fromToken: DEPOSIT_USDC_ADDRESSES[SUPPORTED_DEPOSIT_CHAINS.ARBITRUM],
        fromAmount: '1000000',
        sourceChainId: SUPPORTED_DEPOSIT_CHAINS.ARBITRUM,
        split: { '42161': 1 },
      }).success,
    ).toBe(true);
  });

  it('rejects HyperCore (1337) as a source chain', () => {
    const result = PlanOrchestrationDepositRequestSchema.safeParse({
      kind: 'invest',
      userAddress: USER,
      fromToken: BASE_USDC_ADDRESS,
      fromAmount: '1000000',
      sourceChainId: HYPERCORE_CHAIN_ID,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) =>
          issue.path.includes('sourceChainId'),
        ),
      ).toBe(true);
    }
  });

  it('accepts a split targeting HyperCore from Base', () => {
    expect(
      PlanOrchestrationDepositRequestSchema.safeParse({
        kind: 'invest',
        userAddress: USER,
        fromToken: BASE_USDC_ADDRESS,
        fromAmount: '1000000',
        sourceChainId: BASE_CHAIN_ID,
        split: { '8453': 0.7, '1337': 0.3 },
      }).success,
    ).toBe(true);
  });

  it('rejects a split containing an unsupported chain', () => {
    const result = PlanOrchestrationDepositRequestSchema.safeParse({
      kind: 'invest',
      userAddress: USER,
      fromToken: BASE_USDC_ADDRESS,
      fromAmount: '1000000',
      sourceChainId: BASE_CHAIN_ID,
      split: { '8453': 0.5, '999': 0.5 },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some(
          (issue) =>
            issue.path.includes('split') &&
            issue.message.includes('Unsupported split chain 999'),
        ),
      ).toBe(true);
    }
  });

  it('rejects a multi-chain split from a non-Base source (re-quotes are single-chain)', () => {
    const result = PlanOrchestrationDepositRequestSchema.safeParse({
      kind: 'invest',
      userAddress: USER,
      fromToken: DEPOSIT_USDC_ADDRESSES[SUPPORTED_DEPOSIT_CHAINS.ARBITRUM],
      fromAmount: '1000000',
      sourceChainId: SUPPORTED_DEPOSIT_CHAINS.ARBITRUM,
      split: { '42161': 0.5, '1337': 0.5 },
    });
    expect(result.success).toBe(false);
  });
});

describe('StrategyAllocationSchema', () => {
  const allocation = {
    id: 'morpho-base-usdc',
    label: 'Morpho Base USDC',
    weightBps: 4000,
    chainId: SUPPORTED_DEPOSIT_CHAINS.BASE,
    protocol: 'morpho',
    fromToken: BASE_USDC_ADDRESS,
    fromAmount: '40000000',
    toToken: VAULT,
    toAmountMin: '39000000',
    gasUsd: '0.20',
    durationSec: 30,
  };

  it('accepts an allocation without an optional market key', () => {
    expect(StrategyAllocationSchema.safeParse(allocation).success).toBe(true);
  });

  it('accepts the maximum permitted basis-point weight', () => {
    expect(
      StrategyAllocationSchema.safeParse({
        ...allocation,
        weightBps: 10_000,
      }).success,
    ).toBe(true);
  });

  it('rejects zero basis points', () => {
    expect(
      StrategyAllocationSchema.safeParse({ ...allocation, weightBps: 0 })
        .success,
    ).toBe(false);
  });

  it('rejects a weight above 10,000 basis points', () => {
    expect(
      StrategyAllocationSchema.safeParse({ ...allocation, weightBps: 10_001 })
        .success,
    ).toBe(false);
  });
});

describe('StrategyChainExecutionGroupSchema', () => {
  const group = {
    id: 'base-morpho',
    chainId: SUPPORTED_DEPOSIT_CHAINS.BASE,
    fromToken: BASE_USDC_ADDRESS,
    fromAmount: '40000000',
    approvals: [],
    calls: [],
    allocationIds: ['morpho-base-usdc'],
    gasUsd: '0.20',
  };

  it('accepts a group with at least one allocation', () => {
    expect(StrategyChainExecutionGroupSchema.safeParse(group).success).toBe(
      true,
    );
  });

  it('rejects a group with no allocations', () => {
    expect(
      StrategyChainExecutionGroupSchema.safeParse({
        ...group,
        allocationIds: [],
      }).success,
    ).toBe(false);
  });
});

describe('MockBridgeCheckpointSchema', () => {
  const checkpoint = {
    kind: 'mock-bridge',
    id: 'base-to-arbitrum',
    fromChainId: SUPPORTED_DEPOSIT_CHAINS.BASE,
    toChainId: SUPPORTED_DEPOSIT_CHAINS.ARBITRUM,
    afterGroupId: 'base-morpho',
    beforeGroupId: 'arbitrum-gmx',
    amountUsd6: '60000000',
    disclosure: 'Mock only; no funds move.',
  };

  it('accepts the fixed Base-to-Arbitrum checkpoint', () => {
    expect(MockBridgeCheckpointSchema.safeParse(checkpoint).success).toBe(true);
  });

  it('rejects a checkpoint with a different route id', () => {
    expect(
      MockBridgeCheckpointSchema.safeParse({
        ...checkpoint,
        id: 'arbitrum-to-base',
      }).success,
    ).toBe(false);
  });
});

describe('StrategyDepositPlanSchema', () => {
  const transaction = (chainId: number, intentType: string) => ({
    to: VAULT,
    data: '0x',
    value: '0',
    chainId,
    meta: { intentType },
  });

  const allocation = (params: {
    id: 'morpho-base-usdc' | 'gmx-btc-usdc' | 'gmx-eth-usdc';
    weightBps: number;
    chainId: 8453 | 42161;
    protocol: 'morpho' | 'gmx-v2';
    marketKey?: 'btc-usdc' | 'eth-usdc';
  }) => ({
    ...params,
    label: params.id,
    fromToken:
      params.chainId === 8453
        ? BASE_USDC_ADDRESS
        : DEPOSIT_USDC_ADDRESSES[SUPPORTED_DEPOSIT_CHAINS.ARBITRUM],
    fromAmount: String(params.weightBps),
    toToken: VAULT,
    toAmountMin: String(params.weightBps),
    gasUsd: '0',
    durationSec: 60,
  });

  const validPlan = () =>
    ({
      kind: 'strategy',
      strategyId: STRATEGY_DEPOSIT_ID,
      totalUsd6: '100000000',
      allocations: [
        allocation({
          id: 'morpho-base-usdc',
          weightBps: 4000,
          chainId: 8453,
          protocol: 'morpho',
        }),
        allocation({
          id: 'gmx-btc-usdc',
          weightBps: 3000,
          chainId: 42161,
          protocol: 'gmx-v2',
          marketKey: 'btc-usdc',
        }),
        allocation({
          id: 'gmx-eth-usdc',
          weightBps: 3000,
          chainId: 42161,
          protocol: 'gmx-v2',
          marketKey: 'eth-usdc',
        }),
      ],
      executionGroups: [
        {
          id: 'base-morpho',
          chainId: 8453,
          fromToken: BASE_USDC_ADDRESS,
          fromAmount: '40000000',
          approvals: [],
          calls: [transaction(8453, 'SUPPLY')],
          allocationIds: ['morpho-base-usdc'],
          gasUsd: '0',
        },
        {
          id: 'arbitrum-gmx',
          chainId: 42161,
          fromToken: DEPOSIT_USDC_ADDRESSES[SUPPORTED_DEPOSIT_CHAINS.ARBITRUM],
          fromAmount: '60000000',
          approvals: [],
          calls: [transaction(42161, 'SUPPLY'), transaction(42161, 'SUPPLY')],
          allocationIds: ['gmx-btc-usdc', 'gmx-eth-usdc'],
          gasUsd: '0',
        },
      ],
      checkpoints: [
        {
          kind: 'mock-bridge',
          id: 'base-to-arbitrum',
          fromChainId: 8453,
          toChainId: 42161,
          afterGroupId: 'base-morpho',
          beforeGroupId: 'arbitrum-gmx',
          amountUsd6: '60000000',
          disclosure: 'Mock only; no funds move.',
        },
      ],
      totalGasUsd: '0',
    }) as const;

  it('accepts the fixed 40/30/30 plan with a declarative checkpoint', () => {
    expect(StrategyDepositPlanSchema.safeParse(validPlan()).success).toBe(true);
  });

  it('accepts native Base funding when swap precedes supply', () => {
    const plan = validPlan();
    const nativeBasePlan = {
      ...plan,
      allocations: plan.allocations.map((entry, index) =>
        index === 0 ? { ...entry, fromToken: NATIVE_TOKEN_ADDRESS } : entry,
      ),
      executionGroups: plan.executionGroups.map((group, index) =>
        index === 0
          ? {
              ...group,
              fromToken: NATIVE_TOKEN_ADDRESS,
              calls: [transaction(8453, 'SWAP'), ...group.calls],
            }
          : group,
      ),
    };

    expect(StrategyDepositPlanSchema.safeParse(nativeBasePlan).success).toBe(
      true,
    );
  });

  it('rejects native Base funding without the required swap', () => {
    const plan = validPlan();
    const nativeBasePlan = {
      ...plan,
      allocations: plan.allocations.map((entry, index) =>
        index === 0 ? { ...entry, fromToken: NATIVE_TOKEN_ADDRESS } : entry,
      ),
      executionGroups: plan.executionGroups.map((group, index) =>
        index === 0
          ? {
              ...group,
              fromToken: NATIVE_TOKEN_ADDRESS,
            }
          : group,
      ),
    };

    expect(StrategyDepositPlanSchema.safeParse(nativeBasePlan).success).toBe(
      false,
    );
  });

  it('rejects duplicate strategy allocations', () => {
    const plan = validPlan();

    expect(
      StrategyDepositPlanSchema.safeParse({
        ...plan,
        allocations: [
          plan.allocations[0],
          { ...plan.allocations[0] },
          plan.allocations[2],
        ],
      }).success,
    ).toBe(false);
  });

  it('rejects an allocation whose weight differs from the fixed split', () => {
    const plan = validPlan();

    expect(
      StrategyDepositPlanSchema.safeParse({
        ...plan,
        allocations: plan.allocations.map((entry, index) =>
          index === 0 ? { ...entry, weightBps: 3999 } : entry,
        ),
      }).success,
    ).toBe(false);
  });

  it('rejects a missing execution group', () => {
    const plan = validPlan();

    expect(
      StrategyDepositPlanSchema.safeParse({
        ...plan,
        executionGroups: plan.executionGroups.slice(0, 1),
      }).success,
    ).toBe(false);
  });

  it('rejects reversed execution groups', () => {
    const plan = validPlan();

    expect(
      StrategyDepositPlanSchema.safeParse({
        ...plan,
        executionGroups: [...plan.executionGroups].reverse(),
      }).success,
    ).toBe(false);
  });

  it('rejects a transaction on a chain different from its group', () => {
    const plan = validPlan();

    expect(
      StrategyDepositPlanSchema.safeParse({
        ...plan,
        executionGroups: plan.executionGroups.map((group, index) =>
          index === 0
            ? {
                ...group,
                calls: [transaction(42161, 'SUPPLY')],
              }
            : group,
        ),
      }).success,
    ).toBe(false);
  });

  it('rejects an unsupported Base funding token', () => {
    const plan = validPlan();

    expect(
      StrategyDepositPlanSchema.safeParse({
        ...plan,
        executionGroups: plan.executionGroups.map((group, index) =>
          index === 0 ? { ...group, fromToken: VAULT } : group,
        ),
      }).success,
    ).toBe(false);
  });

  it('accepts Arbitrum USDT funding with swap and supply pairs', () => {
    const plan = validPlan();
    const arbitrumUsdt =
      DEPOSIT_USDT_ADDRESSES[SUPPORTED_DEPOSIT_CHAINS.ARBITRUM];
    const usdtPlan = {
      ...plan,
      allocations: plan.allocations.map((entry, index) =>
        index > 0 ? { ...entry, fromToken: arbitrumUsdt } : entry,
      ),
      executionGroups: plan.executionGroups.map((group, index) =>
        index === 1
          ? {
              ...group,
              fromToken: arbitrumUsdt,
              calls: [
                transaction(42161, 'SWAP'),
                transaction(42161, 'SUPPLY'),
                transaction(42161, 'SWAP'),
                transaction(42161, 'SUPPLY'),
              ],
            }
          : group,
      ),
    };

    expect(StrategyDepositPlanSchema.safeParse(usdtPlan).success).toBe(true);
  });

  it('rejects an unsupported Arbitrum funding token', () => {
    const plan = validPlan();

    expect(
      StrategyDepositPlanSchema.safeParse({
        ...plan,
        executionGroups: plan.executionGroups.map((group, index) =>
          index === 1
            ? {
                ...group,
                fromToken: VAULT,
                calls: [
                  transaction(42161, 'SWAP'),
                  transaction(42161, 'SUPPLY'),
                  transaction(42161, 'SWAP'),
                  transaction(42161, 'SUPPLY'),
                ],
              }
            : group,
        ),
      }).success,
    ).toBe(false);
  });

  it('rejects an incomplete Arbitrum call sequence', () => {
    const plan = validPlan();

    expect(
      StrategyDepositPlanSchema.safeParse({
        ...plan,
        executionGroups: plan.executionGroups.map((group, index) =>
          index === 1 ? { ...group, calls: [group.calls[0]] } : group,
        ),
      }).success,
    ).toBe(false);
  });
});

describe('ChainSplitSchema', () => {
  it('accepts chain-id keys with positive weights', () => {
    expect(
      ChainSplitSchema.safeParse({ '8453': 0.7, '1337': 0.3 }).success,
    ).toBe(true);
  });

  it('rejects non-numeric keys', () => {
    expect(ChainSplitSchema.safeParse({ base: 1 }).success).toBe(false);
  });

  it('rejects non-positive weights', () => {
    expect(ChainSplitSchema.safeParse({ '8453': 0 }).success).toBe(false);
    expect(ChainSplitSchema.safeParse({ '8453': -0.5 }).success).toBe(false);
  });
});

describe('Deposit follow-up schemas', () => {
  const hlpStep = {
    kind: 'hyperliquid-vault-deposit',
    chainId: HYPERCORE_CHAIN_ID,
    afterLegIndex: 1,
    amount: { source: 'bridge-output', legIndex: 1 },
    expectedUsd: '3000000',
    minDepositUsd: '5000000',
    action: {
      type: 'vaultTransfer',
      vaultAddress: VAULT,
      isDeposit: true,
    },
    signing: {
      scheme: 'hyperliquid-l1-action',
      hyperliquidChain: 'Mainnet',
      apiUrl: 'https://api.hyperliquid.xyz',
    },
    lockupDays: 4,
  };

  it('accepts a full hyperliquid-vault-deposit step', () => {
    expect(HyperliquidVaultDepositStepSchema.safeParse(hlpStep).success).toBe(
      true,
    );
  });

  it('accepts a fixed-amount variant', () => {
    const fixedAmount = { source: 'fixed', amount: '2500000' };

    expect(FollowUpAmountSchema.safeParse(fixedAmount).success).toBe(true);
    expect(
      HyperliquidVaultDepositStepSchema.safeParse({
        ...hlpStep,
        amount: fixedAmount,
      }).success,
    ).toBe(true);
  });

  it('rejects a wrong chainId on the HLP step', () => {
    expect(
      HyperliquidVaultDepositStepSchema.safeParse({
        ...hlpStep,
        chainId: 8453,
      }).success,
    ).toBe(false);
  });

  it('discriminates follow-up kinds and rejects unknown ones', () => {
    const destinationStep = {
      kind: 'destination-replan',
      chainId: 42161,
      afterLegIndex: 0,
      amount: { source: 'bridge-output', legIndex: 0 },
      replanRequest: {
        kind: 'invest',
        fromToken: DEPOSIT_USDC_ADDRESSES[SUPPORTED_DEPOSIT_CHAINS.ARBITRUM],
        sourceChainId: 42161,
      },
    };

    expect(DepositFollowUpSchema.safeParse(hlpStep).success).toBe(true);
    expect(DestinationReplanStepSchema.safeParse(destinationStep).success).toBe(
      true,
    );
    expect(DepositFollowUpSchema.safeParse(destinationStep).success).toBe(true);
    expect(
      DepositFollowUpSchema.safeParse({ ...hlpStep, kind: 'unknown-step' })
        .success,
    ).toBe(false);
  });

  it('accepts a DepositPlan with followUps and one without', () => {
    const basePlan = {
      legs: [],
      approvals: [],
      calls: [],
      totalGasUsd: '0',
      sourceChainId: 8453,
    };
    expect(DepositPlanSchema.safeParse(basePlan).success).toBe(true);
    expect(PlanOrchestrationDepositPlanSchema.safeParse(basePlan).success).toBe(
      true,
    );
    expect(
      DepositPlanSchema.safeParse({ ...basePlan, followUps: [hlpStep] })
        .success,
    ).toBe(true);
  });

  it('keeps the WithdrawPlan derivation intact (no followUps required)', () => {
    expect(
      WithdrawPlanSchema.safeParse({
        legs: [],
        approvals: [],
        calls: [],
        totalGasUsd: '0',
        sourceChainId: 8453,
      }).success,
    ).toBe(true);
  });
});
