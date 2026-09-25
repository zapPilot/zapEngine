import { describe, expect, it } from 'vitest';
import {
  BASE_DEPOSIT_TOKENS as B,
  ARBITRUM_DEPOSIT_TOKENS as A,
  ETHEREUM_DEPOSIT_TOKENS as E,
} from '@/integration/depositTokens';
import {
  planFunding,
  fundingCapacityUsd6,
  fundingMinimum,
  fundingMinimumMessage,
  STATIC_FUNDING_RANKING,
  fundingPlanSummary,
  fundingBlockerMessage,
  unavailableChainIds,
  unavailableFundingChains,
  FUNDING_SOURCE_EXCLUDED,
  type FundingCandidate,
  type FundingPreferences,
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
import { HYPERCORE_CHAIN_ID } from '@zapengine/types/api';
import { balanceRow as row } from './support/fundingBalanceRow';
// Pinned rather than derived from the recommended sector mix: every balance
// figure below is reasoned against these exact weights, and the mix itself is
// covered by `investSectorModel.test.ts`.
const defaults: TargetAllocation[] = [
  { positionId: 'morpho-base', weightBps: 3600 },
  { positionId: 'gmx-arbitrum', weightBps: 4000 },
  { positionId: 'hlp', weightBps: 2400 },
];
const stable = resolveTargetAllocations({ crypto: 0, stable: 10000, sp500: 0 });
const tokenOf = (c: FundingCandidate) =>
  c.kind === 'evm' ? c.token : 'hypercore';
const routeOf = (c: FundingCandidate) =>
  c.kind === 'evm' ? c.route : 'hypercore';
const morpho: TargetAllocation[] = [
  { positionId: 'morpho-base', weightBps: 10000 },
  { positionId: 'gmx-arbitrum', weightBps: 0 },
  { positionId: 'hlp', weightBps: 0 },
];
function input(
  rows: ChainTokenBalanceRow[],
  allocations = defaults,
  preferences: FundingPreferences = {},
  failed: number[] = [],
  hyperCoreSpendableUsd6: bigint | null = 0n,
) {
  return {
    allocations,
    supply: { rows, unavailableChainIds: failed, hyperCoreSpendableUsd6 },
    constraints: { preferences, gasReserveUsd: 5 },
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
      result.assignments.map((a) => [
        a.usd6,
        tokenOf(a.source),
        routeOf(a.source),
      ]),
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
      fundingPlanSummary({
        sourceCount: 2,
        hasPreferences: false,
        isConnected: true,
      }),
    ).toBe('Selected automatically · 2 sources');
    expect(result.options.hlp!.map((o) => tokenOf(o.candidate))).toEqual([
      'hypercore',
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
    expect(result.assignments.map((a) => tokenOf(a.source))).toEqual([
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
    expect(result.assignments.map((a) => routeOf(a.source))).toEqual([
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
  it('narrows only the preferred chain and leaves the other chain automatic', () => {
    const result = plan(
      input([row(B[0], 100), row(A[0], 100), row(B[1], 100)], defaults, {
        8453: 'ETH',
      }),
    );
    expect(result.blockers).toEqual([]);
    expect(
      result.assignments.map((a) => [tokenOf(a.source), routeOf(a.source)]),
    ).toEqual([
      [B[1], 'swap-deposit'],
      [A[0], 'deposit'],
      [A[0], 'bridge2'],
    ]);
  });
  it('reproduces the automatic plan when a preference names the recommended token', () => {
    const rows = [row(B[0], 100), row(A[0], 100)];
    const auto = input(rows);
    const preferred = input(rows, defaults, { 8453: 'USDC', 42161: 'USDC' });
    expect(fundingCapacityUsd6(preferred)).toBe(fundingCapacityUsd6(auto));
    expect(stageDraftsKey(plan(preferred).stages!)).toBe(
      stageDraftsKey(plan(auto).stages!),
    );
  });
  it('separates a preference no chain offers from one that breaks a viable plan', () => {
    for (const [preferences, reason] of [
      [{ 8453: 'USDT' }, 'not-a-candidate'],
      [{ 42161: 'ETH' }, 'blocks-plan'],
    ] as const) {
      const rejected = plan(
        input([row(B[0], 100), row(A[0], 100)], defaults, preferences),
      );
      expect(rejected.stages).toBeNull();
      expect(rejected.blockers).toEqual([
        {
          kind: 'override-not-viable',
          chainId: Number(Object.keys(preferences)[0]),
          symbol: Object.values(preferences)[0],
          reason,
        },
      ]);
    }
    // An unfundable wallet is not the preference's fault, so no blame is
    // assigned to a chain the empty-preference solve could not fund either.
    expect(
      plan(input([], defaults, { 42161: 'ETH' })).blockers[0]?.kind,
    ).not.toBe('override-not-viable');
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
    // $4 at the fixture's $2000 ETH is exactly the two-pool basket's
    // 0.002 ETH of keeper fees, which leaves nothing to deposit.
    expect(
      plan(input([row(A[2], 100)], crypto), 4000000n).blockers[0]?.kind,
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
      input([], defaults, { 8453: 'USDT' }),
      input([], defaults, {}, [8453]),
      input([row(A[2], 100)], crypto),
    ]) {
      const result = plan(config, 4000000n);
      expect(fundingBlockerMessage(result.blockers[0]!)).toBeTruthy();
    }
    expect(
      fundingPlanSummary({
        sourceCount: 0,
        hasPreferences: true,
        isConnected: false,
      }),
    ).toBe('Connect a wallet to see your plan');
    expect(
      fundingPlanSummary({
        sourceCount: 0,
        hasPreferences: false,
        isConnected: true,
      }),
    ).toBe('Selected automatically · Waiting for available balances');
    expect(
      fundingPlanSummary({
        sourceCount: 1,
        hasPreferences: true,
        isConnected: true,
      }),
    ).toBe('Custom · 1 source');
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

describe('HyperCore as a funding source', () => {
  const hlpOnly: TargetAllocation[] = [
    { positionId: 'morpho-base', weightBps: 0 },
    { positionId: 'gmx-arbitrum', weightBps: 0 },
    { positionId: 'hlp', weightBps: 10000 },
  ];
  const evmRows = [row(B[0], 36), row(A[0], 40)];

  it('funds HLP from an existing HyperCore balance and leaves it out of the batches', () => {
    const result = plan(input(evmRows, defaults, {}, [], 24000000n));
    expect(result.blockers).toEqual([]);
    expect(result.hyperCoreLeg).toEqual({ weightBps: 2400, usd6: '24000000' });
    expect(
      result.stages!.map((stage) => [stage.positionId, stage.usd6]),
    ).toEqual([
      ['morpho-base', '36000000'],
      ['gmx-arbitrum', '40000000'],
    ]);
    expect(chainBatchDrafts(result.stages!).map((b) => b.chainId)).toEqual([
      8453, 42161,
    ]);
    expect(result.assignments.map((a) => tokenOf(a.source))).toEqual([
      B[0],
      A[0],
      'hypercore',
    ]);
  });

  it('ignores a HyperCore balance that cannot cover the whole HLP share', () => {
    const bridged = plan(input([row(B[0], 36), row(A[0], 64)]));
    const partial = plan(
      input([row(B[0], 36), row(A[0], 64)], defaults, {}, [], 23999999n),
    );
    expect(partial.hyperCoreLeg).toBeNull();
    expect(stageDraftsKey(partial.stages!)).toBe(
      stageDraftsKey(bridged.stages!),
    );
    expect(partial.warnings).toContainEqual({
      kind: 'hypercore-partial',
      availableUsd6: 23999999n,
      requiredUsd6: 24000000n,
    });
  });

  it('treats an unreadable HyperCore balance as zero rather than blocking step 1', () => {
    const unknown = plan(
      input([row(B[0], 36), row(A[0], 64)], defaults, {}, [], null),
    );
    expect(unknown.stages).not.toBeNull();
    expect(unknown.hyperCoreLeg).toBeNull();
    expect(stageDraftsKey(unknown.stages!)).toBe(
      stageDraftsKey(plan(input([row(B[0], 36), row(A[0], 64)])).stages!),
    );
    expect(unknown.warnings).toContainEqual({
      kind: 'hypercore-balance-unavailable',
    });
  });

  it('refuses a HyperCore-only solve that would leave no wallet batch to sign', () => {
    const result = plan(input([row(A[0], 100)], hlpOnly, {}, [], 100000000n));
    expect(result.hyperCoreLeg).toBeNull();
    expect(
      result.stages!.map((stage) => [stage.positionId, stage.sourceToken]),
    ).toEqual([['hlp', A[0]]]);
  });

  it('declines HyperCore below the vault minimum and bridges instead', () => {
    const tiny: TargetAllocation[] = [
      { positionId: 'morpho-base', weightBps: 5000 },
      { positionId: 'gmx-arbitrum', weightBps: 4950 },
      { positionId: 'hlp', weightBps: 50 },
    ];
    const result = plan(
      input([row(B[0], 100), row(A[0], 100)], tiny, {}, [], 100000000n),
    );
    expect(result.hyperCoreLeg).toBeNull();
    expect(result.stages!.map((s) => s.positionId)).toContain('hlp');
    expect(
      result.options.hlp!.find((o) => o.candidate.kind === 'hypercore')
        ?.rejection,
    ).toBe('below-minimum');
  });

  it('raises the fundable ceiling by the balance already on Hyperliquid', () => {
    const rows = [row(B[0], 36), row(A[0], 40)];
    expect(fundingCapacityUsd6(input(rows))).toBe(62500000n);
    expect(fundingCapacityUsd6(input(rows, defaults, {}, [], 24000000n))).toBe(
      100000000n,
    );
  });

  it('wins on cost alone, not on where it sits in the ranking', () => {
    expect(STATIC_FUNDING_RANKING.hlp.map((c) => c.costTier)).toEqual([
      0, 1, 2, 3, 4, 4, 5,
    ]);
    const lastPlace = {
      ...STATIC_FUNDING_RANKING,
      hlp: [...STATIC_FUNDING_RANKING.hlp].reverse(),
    };
    const config = input(evmRows, defaults, {}, [], 24000000n);
    const result = planFunding(
      {
        ...config,
        demand: {
          totalUsd6: '100000000',
          allocations: config.allocations,
        },
      },
      lastPlace,
    );
    expect(result.hyperCoreLeg).toEqual({ weightBps: 2400, usd6: '24000000' });
  });

  it('lets the user decline the Hyperliquid balance outright', () => {
    const declined = plan(
      input(
        [row(B[0], 36), row(A[0], 64)],
        defaults,
        {
          [HYPERCORE_CHAIN_ID]: FUNDING_SOURCE_EXCLUDED,
        },
        [],
        100000000n,
      ),
    );
    expect(declined.hyperCoreLeg).toBeNull();
    expect(declined.stages!.map((s) => s.positionId)).toContain('hlp');
    // Declining a balance is not a warning to nag about.
    expect(declined.warnings).not.toContainEqual({
      kind: 'hypercore-balance-unavailable',
    });
  });
});

describe('fundingMinimum', () => {
  // The recommended mix: 57% HLP, so $17.55 over a fee-free route and $17.91
  // over LI.FI.
  const recommended = resolveTargetAllocations(DEFAULT_SECTOR_WEIGHTS);
  const minimumAt = (config: ReturnType<typeof input>, amount: bigint) =>
    fundingMinimum({
      ...config,
      demand: { totalUsd6: amount.toString(), allocations: config.allocations },
    });
  const hlpStage = (config: ReturnType<typeof input>, amount: bigint) =>
    plan(config, amount).stages?.find((stage) => stage.positionId === 'hlp');

  it('holds a Bridge2-funded HLP share to the vault minimum alone', () => {
    const config = input([row(B[0], 100), row(A[0], 100)], recommended);
    expect(hlpStage(config, 17_550_000n)).toMatchObject({ ingress: 'bridge2' });
    expect(minimumAt(config, 0n)).toEqual({
      usd6: 17_550_000n,
      hlpRoute: 'bridge2',
    });
  });

  it('holds a HyperCore-funded HLP share to the vault minimum alone', () => {
    const config = input(
      [row(B[0], 100), row(A[0], 8)],
      recommended,
      {},
      [],
      50_000_000n,
    );
    expect(minimumAt(config, 17_550_000n)).toEqual({
      usd6: 17_550_000n,
      hlpRoute: 'hypercore',
    });
  });

  it('raises the minimum when LI.FI funds HLP, so the old floor is refused', () => {
    // Arbitrum USDC covers GMX but not HLP as well, so HLP bridges from Base.
    const config = input([row(B[0], 100), row(A[0], 8)], recommended);
    // At the input-based $17.55, the plan would bridge a $10.0035 HLP share
    // that LI.FI's fee lands under $10 — the review failure this prevents.
    expect(hlpStage(config, 17_550_000n)).toMatchObject({
      ingress: 'lifi',
      usd6: '10003500',
    });
    expect(minimumAt(config, 17_550_000n)).toEqual({
      usd6: 17_910_000n,
      hlpRoute: 'lifi',
    });
    expect(minimumAt(config, 17_910_000n).usd6).toBe(17_910_000n);
    expect(minimumAt(config, 19_000_000n).usd6).toBe(17_910_000n);
  });

  it('reads the route at the fee-free floor while the amount is below it', () => {
    // All Stable: 95% HLP, so $10.53 fee-free and $10.75 over LI.FI.
    const config = input([row(B[0], 100)], stable, {}, [], 50_000_000n);
    // Below $10 HyperCore is never a candidate, so a $5 plan bridges HLP over
    // LI.FI — but at the minimum the Hyperliquid balance funds it 1:1.
    expect(
      plan(config, 5_000_000n).options.hlp!.find(
        (o) => o.candidate.kind === 'hypercore',
      )?.rejection,
    ).toBe('below-minimum');
    expect(hlpStage(config, 5_000_000n)).toMatchObject({ ingress: 'lifi' });
    expect(minimumAt(config, 5_000_000n)).toEqual({
      usd6: 10_530_000n,
      hlpRoute: 'hypercore',
    });
  });

  it('follows a source the user chose over the cheaper route', () => {
    const rows = [row(B[0], 100), row(A[0], 100)];
    expect(minimumAt(input(rows, stable), 0n)).toEqual({
      usd6: 10_530_000n,
      hlpRoute: 'bridge2',
    });
    const offArbitrum = input(rows, stable, {
      42161: FUNDING_SOURCE_EXCLUDED,
    });
    expect(minimumAt(offArbitrum, 0n)).toEqual({
      usd6: 10_750_000n,
      hlpRoute: 'lifi',
    });
  });

  it('keeps the vault minimum when no source can fund HLP yet', () => {
    expect(minimumAt(input([], recommended), 0n)).toEqual({
      usd6: 17_550_000n,
      hlpRoute: null,
    });
  });

  it('sets no minimum for a mix without HLP', () => {
    expect(minimumAt(input([row(B[0], 100)], morpho), 0n)).toEqual({
      usd6: 0n,
      hlpRoute: null,
    });
  });

  it('says when bridge fees are why the minimum is higher', () => {
    expect(fundingMinimumMessage({ usd6: 17_910_000n, hlpRoute: 'lifi' })).toBe(
      "Enter at least $17.91 so your HLP share still meets Hyperliquid's $10.00 minimum after LI.FI bridge fees.",
    );
    expect(
      fundingMinimumMessage({ usd6: 17_550_000n, hlpRoute: 'bridge2' }),
    ).toBe(
      "Enter at least $17.55 so your HLP share meets Hyperliquid's $10.00 minimum.",
    );
  });
});
