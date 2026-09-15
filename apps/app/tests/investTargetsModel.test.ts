import { describe, expect, it } from 'vitest';
import {
  BASE_DEPOSIT_TOKENS as B,
  ARBITRUM_DEPOSIT_TOKENS as A,
  ETHEREUM_DEPOSIT_TOKENS as E,
} from '@/integration/depositTokens';
import {
  bpsToPercentInput,
  normalizePercentInput,
  percentInputToBps,
  isValidTargetAllocation,
  targetMinimumUsd6,
  targetUsd6Shares,
  hlpIngressFor,
  chainBatchDrafts,
  chainBatchRequest,
  stageDraftsKey,
  stageLabel,
  chainBatchLabel,
  batchProtocolWeightsBps,
  type StageDraft,
  type TargetAllocation,
} from '@/integration/investTargetsModel';
import {
  DEFAULT_SECTOR_WEIGHTS,
  resolveTargetAllocations,
} from '@/integration/investSectorModel';
const defaults = resolveTargetAllocations(DEFAULT_SECTOR_WEIGHTS);
function allocation(
  morpho: number,
  gmx: number,
  hlp: number,
): TargetAllocation[] {
  return [
    { positionId: 'morpho-base', weightBps: morpho },
    { positionId: 'gmx-arbitrum', weightBps: gmx },
    { positionId: 'hlp', weightBps: hlp },
  ];
}
const stages: StageDraft[] = [
  {
    positionId: 'morpho-base',
    weightBps: 3600,
    usd6: '36000000',
    fromAmount: '36000000',
    sourceToken: B[0],
  },
  {
    positionId: 'gmx-arbitrum',
    weightBps: 4000,
    usd6: '40000000',
    fromAmount: '40000000',
    sourceToken: A[0],
  },
  {
    positionId: 'hlp',
    weightBps: 2400,
    usd6: '24000000',
    fromAmount: '24000000',
    sourceToken: A[0],
    ingress: 'bridge2',
  },
];
describe('isValidTargetAllocation', () => {
  it('rejects weights that do not total 100%', () => {
    expect(isValidTargetAllocation(allocation(4_000, 3_500, 2_400))).toBe(
      false,
    );
  });

  it('rejects fractional basis points and out-of-range weights', () => {
    expect(isValidTargetAllocation(allocation(4_000.5, 3_499.5, 2_500))).toBe(
      false,
    );
    expect(isValidTargetAllocation(allocation(-1_000, 4_500, 6_500))).toBe(
      false,
    );
  });

  it('rejects a duplicated or missing destination', () => {
    expect(
      isValidTargetAllocation([
        { positionId: 'hlp', weightBps: 5_000 },
        { positionId: 'hlp', weightBps: 5_000 },
        { positionId: 'morpho-base', weightBps: 0 },
      ]),
    ).toBe(false);
    expect(
      isValidTargetAllocation([{ positionId: 'hlp', weightBps: 10_000 }]),
    ).toBe(false);
  });
});

describe('targetMinimumUsd6', () => {
  it("is driven by HLP's $10 floor at the default 25% weight", () => {
    expect(targetMinimumUsd6(defaults)).toBe(41_666_667n);
  });

  it('falls back to each destination on its own', () => {
    expect(targetMinimumUsd6(allocation(10_000, 0, 0))).toBe(10_000n);
    expect(targetMinimumUsd6(allocation(0, 10_000, 0))).toBe(1_000_000n);
    expect(targetMinimumUsd6(allocation(0, 0, 10_000))).toBe(10_000_000n);
  });

  it('is zero for an invalid allocation rather than guessing', () => {
    expect(targetMinimumUsd6(allocation(4_000, 3_500, 2_400))).toBe(0n);
  });
});

describe('targetUsd6Shares', () => {
  it('gives the rounding remainder to the last funded destination', () => {
    const shares = targetUsd6Shares('100000001', defaults);
    expect(shares).toEqual({
      'morpho-base': 36_000_000n,
      'gmx-arbitrum': 40_000_000n,
      hlp: 24_000_001n,
    });
  });

  it('excludes zero-weight destinations entirely', () => {
    expect(targetUsd6Shares('50000000', allocation(0, 4_000, 6_000))).toEqual({
      'morpho-base': 0n,
      'gmx-arbitrum': 20_000_000n,
      hlp: 30_000_000n,
    });
  });

  it('returns null for a zero total or an invalid allocation', () => {
    expect(targetUsd6Shares('0', defaults)).toBeNull();
    expect(targetUsd6Shares('100', allocation(1, 1, 1))).toBeNull();
  });
});

describe('frozen execution batches', () => {
  it('preserves source chain and position order for review and execution', () => {
    const batches = chainBatchDrafts(stages);
    expect(
      batches.map((b) => [b.chainId, b.positions.map((p) => p.positionId)]),
    ).toEqual([
      [8453, ['morpho-base']],
      [42161, ['gmx-arbitrum', 'hlp']],
    ]);
    expect(batches.map(chainBatchLabel)).toEqual([
      'Base · Morpho',
      'Arbitrum · GMX + HLP',
    ]);
    expect(batchProtocolWeightsBps(batches[1]!)).toEqual({
      'gmx-v2': 4000,
      hyperliquid: 2400,
    });
    expect(stages.map(stageLabel)).toEqual([
      'Morpho · Base',
      'GMX · Arbitrum',
      'HLP · Arbitrum USDC → Hyperliquid Bridge2',
    ]);
  });
  it('sends the exact frozen amounts and canonical destination splits', () => {
    const user = '0x1111111111111111111111111111111111111111';
    const batches = chainBatchDrafts(stages);
    expect(chainBatchRequest(batches[1]!, user)).toEqual({
      kind: 'chain-batch',
      userAddress: user,
      sourceChainId: 42161,
      positions: [
        {
          kind: 'gmx-v2-basket',
          fromToken: A[0].depositAddress,
          amount: '40000000',
        },
        {
          kind: 'invest',
          fromToken: A[0].depositAddress,
          fromAmount: '24000000',
          split: { '1337': 1 },
        },
      ],
    });
    expect(chainBatchRequest(batches[0]!, user)).toMatchObject({
      positions: [
        {
          kind: 'invest',
          fromToken: B[0].depositAddress,
          fromAmount: '36000000',
          split: { '8453': 1 },
        },
      ],
    });
  });
  it('keys execution identity independently of presentation weights', () => {
    expect(stageDraftsKey(stages)).toBe(
      `morpho-base:8453:${B[0].depositAddress}:36000000:36000000|gmx-arbitrum:42161:${A[0].depositAddress}:40000000:40000000|hlp:42161:${A[0].depositAddress}:24000000:24000000`,
    );
    expect(stageDraftsKey([])).toBe('');
    expect(stageDraftsKey(stages.map((s) => ({ ...s, weightBps: 0 })))).toBe(
      stageDraftsKey(stages),
    );
  });
  it('groups alternate HLP sources without reordering earlier batches', () => {
    for (const token of [B[0], E[0]]) {
      const alternate = [
        ...stages.slice(0, 2),
        {
          ...stages[2]!,
          positionId: 'hlp' as const,
          sourceToken: token,
          ingress: hlpIngressFor(token),
        },
      ];
      expect(chainBatchDrafts(alternate).map((b) => b.chainId)).toEqual(
        token === B[0] ? [8453, 42161] : [8453, 42161, 1],
      );
    }
    expect(hlpIngressFor(A[0])).toBe('bridge2');
    expect(hlpIngressFor(A[2])).toBe('lifi');
  });
});
describe('percentage helpers', () => {
  it('keeps a half-typed percentage editable and clamps at 100', () => {
    expect(normalizePercentInput('12.')).toBe('12.');
    expect(normalizePercentInput('12.345')).toBe('12.34');
    expect(normalizePercentInput('150')).toBe('100');
    expect(normalizePercentInput('a')).toBe('');
  });

  it('round-trips percentages through basis points', () => {
    expect(percentInputToBps('12.5')).toBe(1_250);
    expect(percentInputToBps('')).toBe(0);
    expect(percentInputToBps('.')).toBe(0);
    expect(bpsToPercentInput(1_250)).toBe('12.5');
    expect(bpsToPercentInput(4_000)).toBe('40');
  });
});
