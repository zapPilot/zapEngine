import { CHAIN_BRAND } from '@zapengine/brand-assets';

import type {
  DepositTokenSymbol,
  DesktopDepositToken,
} from '@/integration/depositTokens';
import {
  buildFundingSupply,
  fundingSupplyEntry,
  FUNDING_TOKEN_UNIVERSE,
  sameDepositToken,
  type FundingAssignment,
  type FundingPreferences,
  type FundingSupplyInput,
} from '@/integration/investFundingPlanner';

export type FundingSourceStatus = 'used' | 'idle' | 'empty' | 'unavailable';

export interface FundingSourceRow {
  key: string;
  token: DesktopDepositToken;
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
}

export interface FundingSourceView {
  rows: readonly FundingSourceRow[];
  usedSourceCount: number;
  usedChainCount: number;
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
  const entryFor = (token: DesktopDepositToken) =>
    fundingSupplyEntry(supply, token);

  const selectablePerChain = new Map<number, number>();
  for (const token of FUNDING_TOKEN_UNIVERSE) {
    const entry = entryFor(token);
    if (!entry.unavailable && (entry.spendableUsd6 ?? 0n) > 0n)
      selectablePerChain.set(
        token.chainId,
        (selectablePerChain.get(token.chainId) ?? 0) + 1,
      );
  }

  // Funded balances lead, in the order the review step will batch them; the
  // remainder keeps the fixed universe order so typing an amount never
  // reshuffles the rows underneath the user.
  const tokens: DesktopDepositToken[] = [];
  for (const token of [
    ...input.assignments.map((a) => a.source.token),
    ...FUNDING_TOKEN_UNIVERSE,
  ])
    if (!tokens.some((seen) => sameDepositToken(seen, token)))
      tokens.push(token);

  const rows = tokens.map((token): FundingSourceRow => {
    const entry = entryFor(token);
    const chainLabel = CHAIN_BRAND[token.chainKey].label;
    const usedUsd6 = input.assignments.reduce(
      (total, a) =>
        sameDepositToken(a.source.token, token) ? total + a.usd6 : total,
      0n,
    );
    return {
      key: `${token.chainId}:${token.symbol}`,
      token,
      chainLabel,
      symbol: token.symbol,
      label: `${chainLabel} ${token.symbol}`,
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
      preferred: input.preferences[token.chainId] === token.symbol,
      canChange: (selectablePerChain.get(token.chainId) ?? 0) > 1,
    };
  });

  const used = rows.filter((row) => row.status === 'used');
  return {
    rows,
    usedSourceCount: used.length,
    usedChainCount: new Set(used.map((row) => row.token.chainId)).size,
  };
}
