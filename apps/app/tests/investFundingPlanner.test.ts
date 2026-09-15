import { describe, expect, it } from 'vitest';
import {
  BASE_DEPOSIT_TOKENS as B,
  ARBITRUM_DEPOSIT_TOKENS as A,
  ETHEREUM_DEPOSIT_TOKENS as E,
  type DesktopDepositToken,
} from '@/integration/depositTokens';
import {
  planFunding,
  fundingCapacityUsd6,
  STATIC_FUNDING_RANKING,
  fundingPlanSummary,
  fundingBlockerMessage,
  fundingRouteLabel,
  unavailableChainIds,
  unavailableFundingChains,
  type FundingOverrides,
} from '@/integration/investFundingPlanner';
import {
  DEFAULT_SECTOR_WEIGHTS,
  resolveTargetAllocations,
} from '@/integration/investSectorModel';
import {
  chainBatchDrafts,
  stageDraftsKey,
  type TargetAllocation,
} from '@/integration/investTargetsModel';
import type { ChainTokenBalanceRow } from '@/integration/walletTokens';
const defaults = resolveTargetAllocations(DEFAULT_SECTOR_WEIGHTS);
const stable = resolveTargetAllocations({ crypto: 0, stable: 10000, sp500: 0 });
const morpho: TargetAllocation[] = [
  { positionId: 'morpho-base', weightBps: 10000 },
  { positionId: 'gmx-arbitrum', weightBps: 0 },
  { positionId: 'hlp', weightBps: 0 },
];
function row(
  token: DesktopDepositToken,
  usd: number,
  price: number | null = token.symbol === 'ETH' ? 2000 : 1,
): ChainTokenBalanceRow {
  return {
    id: `${token.chainId}:${token.symbol}`,
    chain: token.chainKey,
    chainLabel: token.chainKey,
    chainId: token.chainId,
    tokenAddress: token.balanceAddress,
    decimals: token.decimals,
    balance: String(usd / (price ?? 2000)),
    balanceBaseUnits:
      token.symbol === 'ETH'
        ? (
            BigInt(Math.round((usd * 1e6) / (price ?? 2000))) *
            10n ** 12n
          ).toString()
        : String(Math.round(usd * 1e6)),
    usdValue: price === null ? null : usd,
    usdPrice: price,
    token: { symbol: token.symbol, name: token.name },
  };
}
function input(
  rows: ChainTokenBalanceRow[],
  allocations = defaults,
  overrides: FundingOverrides = {},
  failed: number[] = [],
) {
  return {
    allocations,
    supply: { rows, unavailableChainIds: failed },
    constraints: { overrides, gasReserveUsd: 5 },
  };
}
function plan(config: ReturnType<typeof input>, amount = 100000000n) {
  return planFunding({
    ...config,
    demand: { totalUsd6: amount.toString(), allocations: config.allocations },
  });
}
describe('automatic funding', () => {
  it('freezes the recommended sources and two exact batches without user token selection', () => {
    const result = plan(input([row(B[0], 100), row(A[0], 100)]));
    expect(result.blockers).toEqual([]);
    expect(
      result.assignments.map((a) => [a.usd6, a.source.token, a.source.route]),
    ).toEqual([
      [36000000n, B[0], 'deposit'],
      [40000000n, A[0], 'deposit'],
      [24000000n, A[0], 'bridge2'],
    ]);
    expect(chainBatchDrafts(result.stages!).map((b) => b.chainId)).toEqual([
      8453, 42161,
    ]);
    expect(stageDraftsKey(result.stages!)).toBe(
      `morpho-base:8453:${B[0].depositAddress}:36000000:36000000|gmx-arbitrum:42161:${A[0].depositAddress}:40000000:40000000|hlp:42161:${A[0].depositAddress}:24000000:24000000`,
    );
    expect(
      fundingPlanSummary(result, { hasOverrides: false, isConnected: true }),
    ).toBe('Recommended · Base USDC + Arbitrum USDC · 2 wallet batches');
    expect(fundingRouteLabel(result.assignments[2]!)).toContain('Bridge2');
    expect(result.options.hlp!.map((o) => o.candidate.token)).toEqual([
      A[0],
      B[0],
      E[0],
      B[1],
      A[2],
      E[1],
    ]);
  });
  it('chooses the lowest total cost instead of greedily consuming HLP bridge funds', () => {
    const result = plan(input([row(B[0], 36), row(A[0], 24), row(A[1], 40)]));
    expect(result.assignments.map((a) => a.source.token)).toEqual([
      B[0],
      A[1],
      A[0],
    ]);
    expect(result.stages).not.toBeNull();
  });
  it('shares reservations and falls back to Base or Ethereum for HLP', () => {
    for (const [rows, chainIds] of [
      [
        [row(B[0], 60), row(A[0], 40)],
        [8453, 42161],
      ],
      [
        [row(B[0], 36), row(A[0], 40), row(E[0], 24)],
        [8453, 42161, 1],
      ],
    ] as const) {
      const result = plan(input([...rows]));
      expect(chainBatchDrafts(result.stages!).map((b) => b.chainId)).toEqual(
        chainIds,
      );
    }
    expect(plan(input([row(B[0], 100)])).blockers[0]).toMatchObject({
      kind: 'insufficient-single-source',
      positionId: 'gmx-arbitrum',
    });
  });
  it('reserves five dollars once in a shared ETH pool and enforces the exact capacity', () => {
    const config = input([row(B[1], 105)], stable);
    const result = plan(config);
    expect(result.stages).toHaveLength(2);
    expect(result.assignments.map((a) => a.source.route)).toEqual([
      'swap-deposit',
      'lifi-swap-bridge',
    ]);
    expect(result.warnings).toContainEqual({
      kind: 'eth-reserve-applied',
      chainId: 8453,
    });
    for (const value of [5.5, 5, 4]) {
      const test = input([row(B[1], value)], morpho);
      const capacity = fundingCapacityUsd6(test);
      expect(capacity).toBe(value > 5 ? 500000n : 0n);
      expect(plan(test, (capacity ?? 0n) + 1n).stages).toBeNull();
    }
  });
  it('honors viable overrides and rejects unsupported, unpriced or insufficient overrides', () => {
    const config = input(
      [row(B[0], 100), row(A[0], 100), row(B[1], 100)],
      defaults,
      { hlp: B[1] },
    );
    const result = plan(config);
    expect(result.assignments[2]).toMatchObject({
      pinned: true,
      source: { token: B[1], route: 'lifi-swap-bridge' },
    });
    expect(result.options.hlp!.filter((o) => o.selected)).toHaveLength(1);
    for (const [token, rows, reason] of [
      [A[1], [], 'not-a-candidate'],
      [B[1], [], 'insufficient'],
      [B[1], [row(B[1], 100, null)], 'no-price'],
    ] as const) {
      const rejected = plan(
        input([row(B[0], 100), row(A[0], 100), ...rows], defaults, {
          hlp: token,
        }),
      );
      expect(rejected.stages).toBeNull();
      expect(rejected.blockers).toEqual([
        { kind: 'override-not-viable', positionId: 'hlp', token, reason },
      ]);
    }
  });
  it('reports unavailable required chains and allows HLP to use another chain', () => {
    expect(unavailableChainIds(['eth', 'base', 'arbitrum'])).toEqual([
      1, 8453, 42161,
    ]);
    expect(unavailableFundingChains(defaults, [8453], {})).toBe(true);
    expect(
      plan(input([row(B[0], 100), row(A[0], 100)], defaults, {}, [8453]))
        .blockers[0]?.kind,
    ).toBe('chain-unavailable');
    const result = plan(input([row(B[0], 100)], stable, {}, [42161]));
    expect(result.stages).not.toBeNull();
    expect(result.warnings).toContainEqual({
      kind: 'chain-balances-unavailable',
      chainId: 42161,
    });
    expect(result.warnings).toContainEqual({
      kind: 'low-gas',
      chainId: 8453,
      ethUsd: 0,
    });
  });
  it('keeps ETH pricing unknown only when no known funded capacity exists', () => {
    expect(
      fundingCapacityUsd6(input([row(B[1], 100, null)], morpho)),
    ).toBeNull();
    expect(
      fundingCapacityUsd6(
        input([row(B[0], 100), row(B[1], 100, null)], morpho),
      ),
    ).toBe(100000000n);
    expect(plan(input([row(B[1], 100, null)], morpho)).blockers[0]?.kind).toBe(
      'no-price',
    );
  });
  it('enforces GMX keeper fees and rejects invalid allocations', () => {
    const crypto = resolveTargetAllocations({
      crypto: 10000,
      stable: 0,
      sp500: 0,
    });
    expect(
      plan(input([row(A[2], 100)], crypto), 8000000n).blockers[0]?.kind,
    ).toBe('gmx-eth-budget');
    expect(plan(input([], [])).blockers).toEqual([
      { kind: 'invalid-allocation' },
    ]);
    expect(fundingCapacityUsd6(input([], []))).toBe(0n);
    expect(
      STATIC_FUNDING_RANKING['gmx-arbitrum'].map((c) => c.costTier),
    ).toEqual([0, 1, 2]);
    for (const config of [
      input([]),
      input([], []),
      input([row(B[1], 10, null)]),
      input([], defaults, { hlp: A[1] }),
      input([], defaults, {}, [8453]),
      input([row(A[2], 100)], crypto),
    ]) {
      const result = plan(config, 8000000n);
      expect(fundingBlockerMessage(result.blockers[0]!)).toBeTruthy();
    }
    expect(
      fundingPlanSummary(plan(input([])), {
        hasOverrides: true,
        isConnected: false,
      }),
    ).toBe('Connect a wallet to see your plan');
  });
  it('Max and Max plus one respect shared pools throughout a balance grid', () => {
    for (const base of [0, 0.5, 36, 60, 100])
      for (const arb of [0, 0.5, 40, 64, 100])
        for (const eth of [0, 5, 5.5, 105]) {
          const config = input([
            row(B[0], base),
            row(A[0], arb),
            row(B[1], eth),
          ]);
          const capacity = fundingCapacityUsd6(config)!;
          if (capacity > 0n)
            expect(
              plan(config, capacity).stages,
              `${base}/${arb}/${eth}/${capacity}`,
            ).not.toBeNull();
          expect(
            plan(config, capacity + 1n).stages,
            `${base}/${arb}/${eth}/${capacity}`,
          ).toBeNull();
        }
  });
});
