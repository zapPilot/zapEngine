import { describe, expect, it } from 'vitest';
import {
  buildHomeIncomeView,
  partitionIncomeRowsByCoverage,
} from '../src/integration/homeIncomeModel';
import {
  batchProtocolWeightsBps,
  chainBatchActionSummary,
  chainBatchDrafts,
  chainBatchLabel,
  chainBatchRequest,
  hlpIngressFor,
  hlpRouteLabel,
  isValidTargetAllocation,
  normalizePercentInput,
  percentInputToBps,
  positionRequest,
  stageDraftsKey,
  stageLabel,
  targetMinimumUsd6,
  targetUsd6Shares,
  weightBpsFor,
  type ChainBatchDraft,
} from '../src/integration/investTargetsModel';

const allocations = [
  { positionId: 'morpho-base', weightBps: 1000 },
  { positionId: 'gmx-arbitrum', weightBps: 3000 },
  { positionId: 'hlp', weightBps: 6000 },
] as const;

const token = (overrides: Record<string, unknown> = {}) =>
  ({
    chainId: 42161,
    chainKey: 'arbitrum',
    symbol: 'USDC',
    decimals: 6,
    depositAddress: '0x0000000000000000000000000000000000000001',
    ...overrides,
  }) as never;

const draft = (
  positionId: 'morpho-base' | 'gmx-arbitrum' | 'hlp',
  overrides: Record<string, unknown> = {},
) =>
  ({
    positionId,
    weightBps: 1000,
    usd6: '1000000',
    fromAmount: '1000000',
    sourceToken: token(),
    ...(positionId === 'hlp' ? { ingress: 'bridge2' } : {}),
    ...overrides,
  }) as never;

describe('coverage handoff: target allocation validation', () => {
  it('rejects wrong length, duplicate positions, fractions, and bounds', () => {
    expect(isValidTargetAllocation([])).toBe(false);
    expect(
      isValidTargetAllocation([allocations[0], allocations[0], allocations[2]]),
    ).toBe(false);
    expect(
      isValidTargetAllocation([
        { ...allocations[0], weightBps: 1000.5 },
        allocations[1],
        allocations[2],
      ]),
    ).toBe(false);
    expect(
      isValidTargetAllocation([
        { ...allocations[0], weightBps: -1 },
        allocations[1],
        allocations[2],
      ]),
    ).toBe(false);
    expect(
      isValidTargetAllocation([
        { ...allocations[0], weightBps: 10_001 },
        allocations[1],
        allocations[2],
      ]),
    ).toBe(false);
    expect(isValidTargetAllocation(allocations)).toBe(true);
  });

  it('returns zero for an absent position and invalid minimum plan', () => {
    expect(weightBpsFor(allocations, 'hlp')).toBe(6000);
    expect(weightBpsFor(allocations.slice(0, 2), 'hlp')).toBe(0);
    expect(targetMinimumUsd6([], 'lifi')).toBe(0n);
    expect(targetMinimumUsd6(allocations, 'bridge2')).toBeGreaterThan(0n);
  });

  it('rejects malformed totals and preserves every integer unit', () => {
    expect(targetUsd6Shares('bad', allocations)).toBeNull();
    expect(targetUsd6Shares('0', allocations)).toBeNull();
    expect(targetUsd6Shares('100', [])).toBeNull();
    const shares = targetUsd6Shares('101', allocations)!;
    expect(Object.values(shares).reduce((sum, value) => sum + value, 0n)).toBe(
      101n,
    );
  });
});

describe('coverage handoff: chain-batch construction', () => {
  it('groups stages by first-seen source chain', () => {
    const morpho = draft('morpho-base', {
      sourceToken: token({ chainId: 8453, chainKey: 'base' }),
    });
    const gmx = draft('gmx-arbitrum');
    const hlp = draft('hlp');
    const batches = chainBatchDrafts([morpho, gmx, hlp]);
    expect(batches.map((batch) => batch.chainId)).toEqual([8453, 42161]);
    expect(batches[1]?.positions).toEqual([gmx, hlp]);
  });

  it('creates venue-specific request shapes', () => {
    expect(positionRequest(draft('gmx-arbitrum'))).toMatchObject({
      kind: 'gmx-v2-basket',
      amount: '1000000',
    });
    expect(positionRequest(draft('morpho-base'))).toMatchObject({
      kind: 'invest',
      fromAmount: '1000000',
      split: { '8453': 1 },
    });
    expect(positionRequest(draft('hlp'))).toMatchObject({
      kind: 'invest',
      split: { '1337': 1 },
    });
  });

  it('builds reviewed requests and stable cache keys', () => {
    const positions = [draft('gmx-arbitrum'), draft('hlp')];
    const batch = {
      chainId: 42161,
      positions,
    } as unknown as ChainBatchDraft;
    expect(
      chainBatchRequest(batch, '0x0000000000000000000000000000000000000002'),
    ).toMatchObject({
      kind: 'chain-batch',
      sourceChainId: 42161,
      positions: [{ kind: 'gmx-v2-basket' }, { kind: 'invest' }],
    });
    expect(stageDraftsKey(positions)).toContain('gmx-arbitrum:42161');
    expect(batchProtocolWeightsBps(batch)).toEqual({
      'gmx-v2': 1000,
      hyperliquid: 1000,
    });
    expect(chainBatchActionSummary(batch)).toBe(
      'Deposit into GMX GM basket · Bridge to Hyperliquid for HLP',
    );
  });

  it('falls back to a numeric chain label for an empty batch', () => {
    expect(chainBatchLabel({ chainId: 999, positions: [] })).toBe(
      'Chain 999 · ',
    );
  });

  it('chooses Bridge2 only for Arbitrum USDC and labels both routes', () => {
    expect(hlpIngressFor(token())).toBe('bridge2');
    expect(hlpIngressFor(token({ symbol: 'ETH' }))).toBe('lifi');
    expect(hlpRouteLabel(token())).toContain('Bridge2');
    expect(hlpRouteLabel(token({ symbol: 'ETH' }), 'lifi')).toContain('LI.FI');
    expect(stageLabel(draft('morpho-base'))).toBe('Morpho · Base');
    expect(stageLabel(draft('gmx-arbitrum'))).toBe('GMX · Arbitrum');
    expect(stageLabel(draft('hlp'))).toContain('HLP ·');
  });

  it('normalizes partial and out-of-range percentage input', () => {
    expect(normalizePercentInput('abc')).toBe('');
    expect(normalizePercentInput('.')).toBe('.');
    expect(normalizePercentInput('12.345')).toBe('12.34');
    expect(normalizePercentInput('101')).toBe('100');
    expect(percentInputToBps('.')).toBe(0);
    expect(percentInputToBps('101')).toBe(10_000);
  });
});

describe('coverage handoff: home income sorting and rollup', () => {
  const summary = (breakdown: unknown[], observedDays = 10) =>
    ({
      windows: {
        '30d': {
          statistics: { total_days: observedDays },
          median_daily_yield_usd: 1,
          protocol_breakdown: breakdown,
        },
      },
    }) as never;

  it('returns an empty result without a usable window', () => {
    expect(buildHomeIncomeView(undefined)).toMatchObject({
      status: 'empty',
      protocolRows: [],
    });
    expect(buildHomeIncomeView(summary([], 0))).toMatchObject({
      status: 'empty',
      observedDays: 0,
    });
  });

  it('sorts gains before costs and defaults optional row arrays', () => {
    const row = (protocol: string, average: number) => ({
      protocol,
      chain: '',
      window: { average_daily_yield_usd: average },
    });
    const result = buildHomeIncomeView(
      summary([row('Aave', -1), row('Moonwell', 1), row('Morpho', 2)]),
    );
    expect(result.protocolRows.map((item) => item.monthlyNetUsd)).toEqual([
      60.8, 30.4, -30.4,
    ]);
    expect(result.protocolRows[0]).toMatchObject({
      tokenSymbols: [],
      positionTypes: [],
    });
  });

  it('keeps a single tail visible but rolls up two or more tail rows', () => {
    const rows = [100, 10, 5, -100, -10, -5].map((monthlyNetUsd, index) => ({
      protocol: `p${index}`,
      label: `p${index}`,
      monthlyNetUsd,
      tokenSymbols: [],
      tokenValues: [],
      positionTypes: [],
    }));
    const partitioned = partitionIncomeRowsByCoverage(rows, 0.5);
    expect(partitioned.other.length).toBeGreaterThanOrEqual(2);
    expect(partitioned.otherIncomeUsd).toBe(15);
    expect(partitioned.otherCostUsd).toBe(-15);
    expect(partitionIncomeRowsByCoverage(rows.slice(0, 2), 0.5).other).toEqual(
      [],
    );
  });
});
