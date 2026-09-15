import { describe, expect, it } from 'vitest';
import {
  ARBITRUM_DEPOSIT_TOKENS as A,
  BASE_DEPOSIT_TOKENS as B,
} from '@/integration/depositTokens';
import {
  fundingCapacityUsd6,
  planFunding,
  type FundingPreferences,
} from '@/integration/investFundingPlanner';
import {
  fundingSourceRows,
  type FundingSourceView,
} from '@/integration/investFundingSources';
import {
  DEFAULT_SECTOR_WEIGHTS,
  resolveTargetAllocations,
} from '@/integration/investSectorModel';
import type { TargetAllocation } from '@/integration/investTargetsModel';
import type { ChainTokenBalanceRow } from '@/integration/walletTokens';
import { balanceRow as row } from './support/fundingBalanceRow';

const GAS_RESERVE_USD = 5;
const defaults = resolveTargetAllocations(DEFAULT_SECTOR_WEIGHTS);
const morpho: TargetAllocation[] = [
  { positionId: 'morpho-base', weightBps: 10000 },
  { positionId: 'gmx-arbitrum', weightBps: 0 },
  { positionId: 'hlp', weightBps: 0 },
];

function view(
  rows: readonly ChainTokenBalanceRow[],
  options: {
    allocations?: readonly TargetAllocation[];
    preferences?: FundingPreferences;
    failed?: number[];
  } = {},
): FundingSourceView {
  const allocations = options.allocations ?? defaults;
  const preferences = options.preferences ?? {};
  const supply = { rows, unavailableChainIds: options.failed ?? [] };
  const plan = planFunding({
    demand: { totalUsd6: '100000000', allocations },
    supply,
    constraints: { preferences, gasReserveUsd: GAS_RESERVE_USD },
  });
  return fundingSourceRows({
    assignments: plan.assignments,
    supply,
    preferences,
    gasReserveUsd: GAS_RESERVE_USD,
  });
}

function rowFor(result: FundingSourceView, key: string) {
  return result.rows.find((entry) => entry.key === key)!;
}

describe('funding sources', () => {
  it('folds every destination drawing on one balance into a single row', () => {
    const result = view([row(B[0], 100), row(A[0], 100)]);
    expect(result.rows.filter((r) => r.key === '42161:USDC')).toHaveLength(1);
    expect(rowFor(result, '42161:USDC')).toMatchObject({
      status: 'used',
      usedUsd6: 64000000n,
      chainLabel: 'Arbitrum',
    });
    expect(rowFor(result, '8453:USDC')).toMatchObject({
      status: 'used',
      usedUsd6: 36000000n,
    });
    expect(result).toMatchObject({ usedSourceCount: 2, usedChainCount: 2 });
  });
  it('keeps two balances on one chain as two rows so capacity is not understated', () => {
    const result = view([row(B[0], 36), row(A[0], 24), row(A[1], 40)]);
    expect(
      result.rows.filter((r) => r.status === 'used').map((r) => r.key),
    ).toEqual(['8453:USDC', '42161:USDT', '42161:USDC']);
    expect(result).toMatchObject({ usedSourceCount: 3, usedChainCount: 2 });
    expect(rowFor(result, '42161:USDT').canChange).toBe(true);
    expect(rowFor(result, '8453:USDC').canChange).toBe(false);
  });
  it('lists funded balances first and separates idle, empty and unavailable', () => {
    const result = view([row(B[0], 100), row(A[0], 100), row(A[1], 50)], {
      failed: [1],
    });
    expect(result.rows.map((r) => [r.key, r.status])).toEqual([
      ['8453:USDC', 'used'],
      ['42161:USDC', 'used'],
      ['8453:ETH', 'empty'],
      ['42161:USDT', 'idle'],
      ['42161:ETH', 'empty'],
      ['1:USDC', 'unavailable'],
      ['1:ETH', 'unavailable'],
    ]);
  });
  it('applies the five dollar gas reserve once, agreeing with planner capacity', () => {
    const rows = [row(B[1], 105)];
    const result = view(rows, { allocations: morpho });
    expect(rowFor(result, '8453:ETH')).toMatchObject({
      balanceUsd6: 105000000n,
      spendableUsd6: 100000000n,
      hasBalance: true,
      status: 'used',
      usedUsd6: 100000000n,
    });
    expect(
      fundingCapacityUsd6({
        allocations: morpho,
        supply: { rows, unavailableChainIds: [] },
        constraints: { preferences: {}, gasReserveUsd: GAS_RESERVE_USD },
      }),
    ).toBe(100000000n);
  });
  it('keeps an unpriced balance visible rather than reporting it as empty', () => {
    const result = view([row(B[0], 100), row(A[0], 100), row(B[1], 100, null)]);
    expect(rowFor(result, '8453:ETH')).toMatchObject({
      balanceUsd6: null,
      spendableUsd6: null,
      hasBalance: true,
      status: 'idle',
    });
  });
  it('marks only the token the user chose for that chain as preferred', () => {
    const result = view([row(B[0], 100), row(A[0], 100), row(B[1], 100)], {
      preferences: { 8453: 'ETH' },
    });
    expect(rowFor(result, '8453:ETH')).toMatchObject({
      preferred: true,
      status: 'used',
    });
    expect(rowFor(result, '8453:USDC').preferred).toBe(false);
    expect(rowFor(result, '42161:USDC').preferred).toBe(false);
  });
});
