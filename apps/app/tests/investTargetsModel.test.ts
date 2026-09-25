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
  HLP_LIFI_HEADROOM_BPS,
  hlpMinimumShareUsd6,
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

describe('hlpMinimumShareUsd6', () => {
  it('asks exactly the vault minimum of routes that land 1:1', () => {
    expect(hlpMinimumShareUsd6('hypercore')).toBe(10_000_000n);
    expect(hlpMinimumShareUsd6('bridge2')).toBe(10_000_000n);
    expect(hlpMinimumShareUsd6(null)).toBe(10_000_000n);
  });

  it('adds the LI.FI headroom so the quoted output still clears $10', () => {
    const share = hlpMinimumShareUsd6('lifi');
    expect(share).toBe(10_204_082n);
    expect((share * (10_000n - HLP_LIFI_HEADROOM_BPS)) / 10_000n).toBe(
      10_000_000n,
    );
  });
});

describe('targetMinimumUsd6', () => {
  it("is driven by HLP's $10 floor at the default 57% weight", () => {
    // $17.543860 rounds up to the first whole cent that clears it.
    expect(targetMinimumUsd6(defaults, 'bridge2')).toBe(17_550_000n);
    expect(targetMinimumUsd6(defaults, 'hypercore')).toBe(17_550_000n);
    expect(targetMinimumUsd6(defaults, null)).toBe(17_550_000n);
  });

  it('sizes a LI.FI-funded HLP share for what the bridge delivers', () => {
    // At $17.55 the HLP share is $10.0035; Base USDC's live 25 bps LI.FI fee
    // (2026-09-25) promises $9.978 of it, which the vault would refuse.
    const feeFree = targetUsd6Shares('17550000', defaults)!.hlp;
    expect(feeFree).toBe(10_003_500n);
    expect((feeFree * 9_975n) / 10_000n).toBeLessThan(10_000_000n);

    expect(targetMinimumUsd6(defaults, 'lifi')).toBe(17_910_000n);
  });

  it('ignores a small Crypto share, since GMX has no deposit minimum', () => {
    const mix = resolveTargetAllocations({
      crypto: 100,
      stable: 9_900,
      sp500: 0,
    });
    expect(mix.map((a) => a.weightBps)).toEqual([495, 100, 9_405]);
    // HLP at 94.05% needs $10.632643; the $1 GMX floor used to force $100.
    const minimum = targetMinimumUsd6(mix, 'bridge2');
    expect(minimum).toBe(10_640_000n);
    expect(
      targetUsd6Shares(minimum.toString(), mix)!.hlp,
    ).toBeGreaterThanOrEqual(10_000_000n);
    expect(targetMinimumUsd6(mix, 'lifi')).toBe(10_850_000n);
  });

  it('keeps every LI.FI minimum above $10 after the worst measured quote', () => {
    // 122 bps: Ethereum ETH -> HyperCore over Relay near $10 (2026-09-25).
    for (let hlp = 100; hlp <= 10_000; hlp += 100) {
      const mix = allocation(10_000 - hlp, 0, hlp);
      const minimum = targetMinimumUsd6(mix, 'lifi');
      const share = targetUsd6Shares(minimum.toString(), mix)!.hlp;
      expect((share * (10_000n - 122n)) / 10_000n).toBeGreaterThanOrEqual(
        10_000_000n,
      );
    }
  });

  it('only sets a minimum when HLP is funded', () => {
    expect(targetMinimumUsd6(allocation(10_000, 0, 0), 'lifi')).toBe(0n);
    expect(targetMinimumUsd6(allocation(0, 10_000, 0), 'lifi')).toBe(0n);
    expect(targetMinimumUsd6(allocation(0, 0, 10_000), 'bridge2')).toBe(
      10_000_000n,
    );
  });

  it('is zero for an invalid allocation rather than guessing', () => {
    expect(targetMinimumUsd6(allocation(4_000, 3_500, 2_400), 'lifi')).toBe(0n);
  });
});

describe('targetUsd6Shares', () => {
  it('gives the rounding remainder to the last funded destination', () => {
    const shares = targetUsd6Shares('100000001', defaults);
    expect(shares).toEqual({
      'morpho-base': 3_000_000n,
      'gmx-arbitrum': 40_000_000n,
      hlp: 57_000_001n,
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
