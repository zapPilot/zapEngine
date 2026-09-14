import type {
  DepositPlan,
  DepositReviewGroup,
  PlanOrchestrationDepositReviewResponse,
  StrategyDepositPlan,
} from '@zapengine/types/api';
import { describe, expect, it } from 'vitest';

import {
  ARBITRUM_DEPOSIT_TOKENS,
  BASE_DEPOSIT_TOKENS,
} from '@/integration/depositTokens';
import {
  hlpStageProgressInput,
  investDoneStatusLabel,
  queueTone,
  resolveStageReviewGroup,
  reviewExpiryKey,
  reviewGroupBlocked,
  riskAcknowledgement,
  sameReviewFingerprints,
  stageSummaryRows,
} from '@/integration/investReviewModel';
import type { StageDraft } from '@/integration/investTargetsModel';

const WALLET = '0x1111111111111111111111111111111111111111';
const HLP_VAULT = '0xdfc24b077bc1425ad1dea75bcb6f8158e10df303';
const HASH_A = `0x${'11'.repeat(32)}`;
const HASH_B = `0x${'22'.repeat(32)}`;
const HASH_C = `0x${'33'.repeat(32)}`;
const HASH_D = `0x${'44'.repeat(32)}`;
const NOW = 1_800_000_000_000;

function group(
  overrides: Partial<DepositReviewGroup> = {},
): DepositReviewGroup {
  return {
    status: 'passed',
    warnings: [],
    chainId: 8453,
    walletAddress: WALLET,
    calls: [],
    assetChanges: [],
    approvals: [],
    contracts: [],
    blockNumber: 1,
    callGas: '21000',
    simulationIds: ['sim-1'],
    shareUrls: [],
    simulationFingerprint: HASH_A,
    riskHash: HASH_B,
    groupId: 'chain-8453',
    groupFingerprint: HASH_C,
    batchFingerprint: HASH_D,
    reviewedAt: NOW - 1_000,
    expiresAt: NOW + 300_000,
    expectedSimulationFingerprint: HASH_A,
    expectedRiskHash: HASH_B,
    blocked: false,
    executionAllowed: true,
    requiresRiskAcknowledgement: false,
    ...overrides,
  } as DepositReviewGroup;
}

const morphoDraft: StageDraft = {
  positionId: 'morpho-base',
  weightBps: 4_000,
  usd6: '40000000',
  sourceToken: BASE_DEPOSIT_TOKENS[0],
  fromAmount: '40000000',
};

const gmxDraft: StageDraft = {
  positionId: 'gmx-arbitrum',
  weightBps: 3_500,
  usd6: '35000000',
  sourceToken: ARBITRUM_DEPOSIT_TOKENS[0],
  fromAmount: '35000000',
};

const hlpDraft: StageDraft = {
  positionId: 'hlp',
  ingress: 'bridge2',
  weightBps: 2_500,
  usd6: '25000000',
  sourceToken: ARBITRUM_DEPOSIT_TOKENS[0],
  fromAmount: '25000000',
};

const hlpPlan: DepositPlan = {
  legs: [
    {
      chainId: 1337,
      kind: 'bridge',
      protocol: 'hyperliquid',
      toToken: ARBITRUM_DEPOSIT_TOKENS[0].depositAddress,
      fromAmount: '25000000',
      toAmountMin: '25000000',
      bridge: 'hyperliquid-bridge2',
      gasUsd: '0',
      durationSec: 60,
    },
  ],
  approvals: [],
  calls: [
    {
      to: ARBITRUM_DEPOSIT_TOKENS[0].depositAddress,
      data: '0xabcd',
      value: '0',
      chainId: 42161,
      meta: { intentType: 'BRIDGE' },
    },
  ],
  followUps: [
    {
      kind: 'hyperliquid-vault-deposit',
      chainId: 1337,
      afterLegIndex: 0,
      amount: { source: 'bridge-output', legIndex: 0 },
      expectedUsd: '25000000',
      minDepositUsd: '10000000',
      action: {
        type: 'vaultTransfer',
        vaultAddress: HLP_VAULT,
        isDeposit: true,
      },
      signing: {
        scheme: 'hyperliquid-l1-action',
        hyperliquidChain: 'Mainnet',
        apiUrl: 'https://api.hyperliquid.xyz',
      },
      lockupDays: 4,
    },
  ],
  totalGasUsd: '0.02',
  sourceChainId: 42161,
};

describe('reviewGroupBlocked', () => {
  it.each([
    ['a passing, unexpired review', group(), false],
    ['an explicitly blocked review', group({ blocked: true }), true],
    ['an unexecutable review', group({ executionAllowed: false }), true],
    [
      'a failed review',
      group({ status: 'failed', failureReason: 'reverted' }),
      true,
    ],
    ['an expired review', group({ expiresAt: NOW - 1 }), true],
  ])('treats %s correctly', (_label, value, expected) => {
    expect(reviewGroupBlocked(value as DepositReviewGroup, NOW)).toBe(expected);
  });
});

describe('sameReviewFingerprints', () => {
  it('compares every hash the wallet executor re-checks', () => {
    expect(sameReviewFingerprints(group(), group())).toBe(true);
    for (const field of [
      'groupFingerprint',
      'batchFingerprint',
      'expectedSimulationFingerprint',
      'expectedRiskHash',
    ] as const) {
      expect(
        sameReviewFingerprints(
          group(),
          group({ [field]: `0x${'99'.repeat(32)}` }),
        ),
      ).toBe(false);
    }
  });

  it('only sends a risk acknowledgement when the review demands one', () => {
    expect(riskAcknowledgement(group())).toEqual({});
    expect(
      riskAcknowledgement(group({ requiresRiskAcknowledgement: true })),
    ).toEqual({ acknowledgedRiskHash: HASH_B });
  });
});

describe('resolveStageReviewGroup', () => {
  function response(
    plan: DepositPlan | StrategyDepositPlan,
    reviews: Record<string, DepositReviewGroup>,
  ): PlanOrchestrationDepositReviewResponse {
    return {
      plan,
      planFingerprint: HASH_A,
      reviewedAt: NOW,
      expiresAt: NOW + 300_000,
      reviews,
    } as PlanOrchestrationDepositReviewResponse;
  }

  it("reads the group keyed by the plan's own source chain", () => {
    const arbitrumGroup = group({ groupId: 'chain-42161', chainId: 42161 });
    expect(
      resolveStageReviewGroup(
        response(hlpPlan, { 'chain-42161': arbitrumGroup }),
      ),
    ).toBe(arbitrumGroup);
  });

  it('returns null when the expected group is missing', () => {
    expect(
      resolveStageReviewGroup(response(hlpPlan, { 'chain-8453': group() })),
    ).toBeNull();
  });

  it('rejects a multi-group strategy plan outright', () => {
    const strategyPlan = {
      kind: 'strategy',
      executionGroups: [],
    } as unknown as StrategyDepositPlan;
    expect(
      resolveStageReviewGroup(
        response(strategyPlan, { 'chain-8453': group() }),
      ),
    ).toBeNull();
  });

  it('keys the expiry ticker by every group deadline', () => {
    expect(reviewExpiryKey([group(), group({ groupId: 'chain-42161' })])).toBe(
      `chain-8453:${NOW + 300_000}|chain-42161:${NOW + 300_000}`,
    );
  });
});

describe('queueTone', () => {
  it('marks earlier batches done and later ones waiting', () => {
    expect(queueTone({ index: 0, currentIndex: 1, phase: 'confirming' })).toBe(
      'done',
    );
    expect(queueTone({ index: 2, currentIndex: 1, phase: 'confirming' })).toBe(
      'waiting',
    );
  });

  it('reflects the active batch phase', () => {
    expect(queueTone({ index: 1, currentIndex: 1, phase: 'failed' })).toBe(
      'failed',
    );
    expect(queueTone({ index: 1, currentIndex: 1, phase: 'checkpoint' })).toBe(
      'done',
    );
    expect(queueTone({ index: 1, currentIndex: 1, phase: 'complete' })).toBe(
      'done',
    );
    expect(queueTone({ index: 1, currentIndex: 1, phase: 'confirming' })).toBe(
      'active',
    );
  });
});

describe('stageSummaryRows', () => {
  it('summarises a Morpho stage without protocol-specific rows', () => {
    const rows = stageSummaryRows({ draft: morphoDraft, plan: undefined });
    expect(rows.map((entry) => entry.label)).toEqual([
      'Funding',
      'Transactions',
      'Source gas',
    ]);
    expect(rows[0]!.value).toBe('40 USDC');
  });

  it('adds the GMX keeper fee row', () => {
    const rows = stageSummaryRows({
      draft: gmxDraft,
      plan: {
        ...hlpPlan,
        calls: [
          {
            ...hlpPlan.calls[0]!,
            meta: {
              intentType: 'SUPPLY',
              route: { executionFeeWei: '4000000000000000' },
            },
          },
        ],
      },
    });
    expect(rows.find((entry) => entry.label === 'Keeper fees')?.value).toBe(
      '0.004 ETH total',
    );
  });

  it('discloses the HLP route, minimum, vault, and withdrawal lock', () => {
    const rows = stageSummaryRows({ draft: hlpDraft, plan: hlpPlan });
    const byLabel = Object.fromEntries(
      rows.map((entry) => [entry.label, entry.value]),
    );
    expect(byLabel['Route']).toBe('Arbitrum USDC → Hyperliquid Bridge2');
    expect(byLabel['Expected received']).toBe('25 USDC');
    expect(byLabel['HLP minimum']).toBe('10 USDC');
    expect(byLabel['Withdrawal lock']).toBe('4 days after deposit');
    expect(byLabel['Official HLP vault']).toContain('…');
  });
});

describe('hlpStageProgressInput', () => {
  const base = {
    hasReviewedSubmission: true,
    reviewedPhase: 'complete' as const,
    reviewedStatusNote: null,
    sourceTxHash: '0xsource',
    baselineUsd6: '1000000',
    wizardStage: 'bridging' as const,
    wizardErrorStage: null,
    hlpStatus: 'awaitingArrival' as const,
    bridgeConfirmed: false,
    flowError: null,
    agentReady: true,
  };

  it('reports the HLP step only when the plan carries one', () => {
    expect(hlpStageProgressInput({ ...base, hlpPlan })).toMatchObject({
      hasExactPlan: true,
      hasHlpStep: true,
    });
    expect(hlpStageProgressInput({ ...base, hlpPlan: null })).toMatchObject({
      hasExactPlan: false,
      hasHlpStep: false,
    });
  });
});

describe('investDoneStatusLabel', () => {
  it('names every destination and distinguishes a pending HLP deposit', () => {
    expect(
      investDoneStatusLabel({
        drafts: [morphoDraft, gmxDraft, hlpDraft],
        hlpDeposited: true,
      }),
    ).toBe('Morpho supplied · GMX settled · HLP deposited');
    expect(
      investDoneStatusLabel({ drafts: [hlpDraft], hlpDeposited: false }),
    ).toBe('HLP pending');
    expect(investDoneStatusLabel({ drafts: [], hlpDeposited: false })).toBe(
      'Route complete',
    );
  });
});
