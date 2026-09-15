import { CHAIN_BRAND, type ChainBrandKey } from '@zapengine/brand-assets';
import { HYPERCORE_CHAIN_ID } from '@zapengine/types/api';

import type {
  DepositTokenSymbol,
  DesktopDepositToken,
} from '@/integration/depositTokens';
import {
  buildFundingSupply,
  candidateChainId,
  candidateSymbol,
  fundingSupplyEntry,
  hyperCoreSupplyEntry,
  FUNDING_TOKEN_UNIVERSE,
  FUNDING_SOURCE_EXCLUDED,
  HYPERCORE_SYMBOL,
  type FundingAssignment,
  type FundingPreferences,
  type FundingSourceChainId,
  type FundingSupplyEntry,
  type FundingSupplyInput,
} from '@/integration/investFundingPlanner';

export type FundingSourceStatus = 'used' | 'idle' | 'empty' | 'unavailable';

export interface FundingSourceRow {
  key: string;
  /** 1337 for HyperCore, which is a destination-side balance, not an EVM chain. */
  chainId: FundingSourceChainId;
  chainKey: ChainBrandKey;
  chainLabel: string;
  symbol: DepositTokenSymbol;
  /** How the balance is named in the UI, e.g. "Arbitrum USDC". */
  label: string;
  /** Balance in USD before the native gas reserve; null when unpriced. */
  balanceUsd6: bigint | null;
  spendableUsd6: bigint | null;
  hasBalance: boolean;
  /** Total this plan draws from this balance across every destination. */
  usedUsd6: bigint;
  status: FundingSourceStatus;
  preferred: boolean;
  /** The chain holds another balance the user could switch to. */
  canChange: boolean;
  /**
   * The user can decline this balance outright. HLP locks withdrawals for four
   * days, so an existing Hyperliquid balance must be refusable even though
   * there is no second HyperCore token to switch to.
   */
  canExclude: boolean;
  excluded: boolean;
}

export interface FundingSourceView {
  rows: readonly FundingSourceRow[];
  usedSourceCount: number;
  /** EVM chains only: this is the number of wallet batches the plan signs. */
  usedChainCount: number;
}

type SourceDescriptor =
  | { kind: 'evm'; token: DesktopDepositToken }
  | { kind: 'hypercore' };

function descriptorKey(source: SourceDescriptor): string {
  return source.kind === 'hypercore'
    ? `${HYPERCORE_CHAIN_ID}:${HYPERCORE_SYMBOL}`
    : `${source.token.chainId}:${source.token.symbol}`;
}

/**
 * Restates a plan as the balances it draws on. A chain can legitimately supply
 * two tokens at once, so rows are keyed by chain *and* symbol; collapsing them
 * per chain would understate what the wallet can fund.
 */
export function fundingSourceRows(input: {
  assignments: readonly FundingAssignment[];
  supply: FundingSupplyInput;
  preferences: FundingPreferences;
  gasReserveUsd: number;
}): FundingSourceView {
  const supply = buildFundingSupply(input.supply, input.gasReserveUsd);
  const entryFor = (source: SourceDescriptor): FundingSupplyEntry =>
    source.kind === 'hypercore'
      ? hyperCoreSupplyEntry(supply)
      : fundingSupplyEntry(supply, source.token);

  const selectablePerChain = new Map<FundingSourceChainId, number>();
  for (const token of FUNDING_TOKEN_UNIVERSE) {
    const entry = fundingSupplyEntry(supply, token);
    if (!entry.unavailable && (entry.spendableUsd6 ?? 0n) > 0n)
      selectablePerChain.set(
        token.chainId,
        (selectablePerChain.get(token.chainId) ?? 0) + 1,
      );
  }

  // Funded balances lead, in the order the review step will batch them; the
  // remainder keeps the fixed universe order so typing an amount never
  // reshuffles the rows underneath the user.
  const sources: SourceDescriptor[] = [];
  for (const source of [
    ...input.assignments.map(
      (a): SourceDescriptor =>
        a.source.kind === 'hypercore'
          ? { kind: 'hypercore' }
          : { kind: 'evm', token: a.source.token },
    ),
    ...FUNDING_TOKEN_UNIVERSE.map(
      (token): SourceDescriptor => ({ kind: 'evm', token }),
    ),
    { kind: 'hypercore' } as SourceDescriptor,
  ])
    if (!sources.some((seen) => descriptorKey(seen) === descriptorKey(source)))
      sources.push(source);

  const rows = sources.map((source): FundingSourceRow => {
    const entry = entryFor(source);
    const chainId: FundingSourceChainId =
      source.kind === 'hypercore' ? HYPERCORE_CHAIN_ID : source.token.chainId;
    const chainKey: ChainBrandKey =
      source.kind === 'hypercore' ? 'hyperliquid' : source.token.chainKey;
    const symbol =
      source.kind === 'hypercore' ? HYPERCORE_SYMBOL : source.token.symbol;
    const chainLabel = CHAIN_BRAND[chainKey].label;
    const usedUsd6 = input.assignments.reduce(
      (total, a) =>
        candidateChainId(a.source) === chainId &&
        candidateSymbol(a.source) === symbol
          ? total + a.usd6
          : total,
      0n,
    );
    const preference = input.preferences[chainId];
    return {
      key: descriptorKey(source),
      chainId,
      chainKey,
      chainLabel,
      symbol,
      label: `${chainLabel} ${symbol}`,
      balanceUsd6: entry.balanceUsd6,
      spendableUsd6: entry.spendableUsd6,
      hasBalance: entry.hasBalance,
      usedUsd6,
      status:
        usedUsd6 > 0n
          ? 'used'
          : entry.unavailable
            ? 'unavailable'
            : entry.hasBalance
              ? 'idle'
              : 'empty',
      preferred: preference === symbol,
      canChange: (selectablePerChain.get(chainId) ?? 0) > 1,
      canExclude: source.kind === 'hypercore',
      excluded: preference === FUNDING_SOURCE_EXCLUDED,
    };
  });

  const used = rows.filter((row) => row.status === 'used');
  return {
    rows,
    usedSourceCount: used.length,
    usedChainCount: new Set(
      used
        .filter((row) => row.chainId !== HYPERCORE_CHAIN_ID)
        .map((row) => row.chainId),
    ).size,
  };
}
