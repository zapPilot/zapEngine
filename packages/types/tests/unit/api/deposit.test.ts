import { describe, expect, it } from 'vitest';

import {
  AddressSchema,
  BASE_CHAIN_ID,
  BASE_USDC_ADDRESS,
  ChainSplitSchema,
  DEPOSIT_USDC_ADDRESSES,
  DepositFollowUpSchema,
  DepositLegSchema,
  DepositPlanSchema,
  DepositRequestSchema,
  HexDataSchema,
  HYPERCORE_CHAIN_ID,
  HyperliquidVaultDepositStepSchema,
  NATIVE_TOKEN_ADDRESS,
  PlanOrchestrationDepositRequestSchema,
  PreparedTransactionSchema,
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
      toToken: VAULT,
      fromAmount: '1000000',
      toAmountMin: '990000',
      gasUsd: '0.42',
      durationSec: 12,
    });
    expect(result.success).toBe(true);
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

  it('accepts a gmx-v2 request without applying Base-only check', () => {
    // gmx-v2 path skips the addBaseDepositValidationIssues branch
    expect(
      PlanOrchestrationDepositRequestSchema.safeParse({
        kind: 'gmx-v2',
        marketKey: 'btc-usdc',
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
        amount: '1000000',
        userAddress: USER,
      }).success,
    ).toBe(false);
  });

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

describe('StrategyDepositPlanSchema', () => {
  it('accepts the fixed 40/30/30 plan with a declarative checkpoint', () => {
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
    const plan = {
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
          calls: [
            {
              to: VAULT,
              data: '0x',
              value: '0',
              chainId: 8453,
              meta: { intentType: 'SUPPLY' },
            },
          ],
          allocationIds: ['morpho-base-usdc'],
          gasUsd: '0',
        },
        {
          id: 'arbitrum-gmx',
          chainId: 42161,
          fromToken: DEPOSIT_USDC_ADDRESSES[SUPPORTED_DEPOSIT_CHAINS.ARBITRUM],
          fromAmount: '60000000',
          approvals: [],
          calls: [
            {
              to: VAULT,
              data: '0x',
              value: '0',
              chainId: 42161,
              meta: { intentType: 'SUPPLY' },
            },
            {
              to: VAULT,
              data: '0x',
              value: '0',
              chainId: 42161,
              meta: { intentType: 'SUPPLY' },
            },
          ],
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
    };
    const result = StrategyDepositPlanSchema.safeParse(plan);

    expect(result.success).toBe(true);

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
              calls: [
                {
                  to: VAULT,
                  data: '0x',
                  value: '40000000000000000',
                  chainId: 8453,
                  meta: { intentType: 'SWAP' },
                },
                ...group.calls,
              ],
            }
          : group,
      ),
    };
    expect(StrategyDepositPlanSchema.safeParse(nativeBasePlan).success).toBe(
      true,
    );
    expect(
      StrategyDepositPlanSchema.safeParse({
        ...nativeBasePlan,
        executionGroups: nativeBasePlan.executionGroups.map((group, index) =>
          index === 0 ? { ...group, calls: group.calls.slice(1) } : group,
        ),
      }).success,
    ).toBe(false);

    expect(
      StrategyDepositPlanSchema.safeParse({
        ...plan,
        executionGroups: [...plan.executionGroups].reverse(),
      }).success,
    ).toBe(false);
    expect(
      StrategyDepositPlanSchema.safeParse({
        ...plan,
        executionGroups: plan.executionGroups.map((group, index) =>
          index === 0
            ? {
                ...group,
                calls: [
                  {
                    to: VAULT,
                    data: '0x',
                    value: '0',
                    chainId: 42161,
                    meta: { intentType: 'SUPPLY' },
                  },
                ],
              }
            : group,
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
    expect(
      HyperliquidVaultDepositStepSchema.safeParse({
        ...hlpStep,
        amount: { source: 'fixed', amount: '2500000' },
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
    expect(DepositFollowUpSchema.safeParse(hlpStep).success).toBe(true);
    expect(
      DepositFollowUpSchema.safeParse({
        kind: 'destination-replan',
        chainId: 42161,
        afterLegIndex: 0,
        amount: { source: 'bridge-output', legIndex: 0 },
        replanRequest: {
          kind: 'invest',
          fromToken: DEPOSIT_USDC_ADDRESSES[SUPPORTED_DEPOSIT_CHAINS.ARBITRUM],
          sourceChainId: 42161,
        },
      }).success,
    ).toBe(true);
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
