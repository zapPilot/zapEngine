import type {
  HyperCoreAccountMode,
  HyperCoreSpendableUsdc,
} from '@zapengine/app-core/services';

export function hlpSpendableUsd6(
  balance: HyperCoreSpendableUsdc | undefined,
): bigint | null {
  return balance?.spendableUsd6 ?? null;
}

export function hlpAccountModeLabel(mode: HyperCoreAccountMode): string {
  return mode === 'unified' ? 'Unified' : 'Standard';
}

function spotSpendable(balance: HyperCoreSpendableUsdc): bigint {
  const value = balance.spot.totalUsd6 - balance.spot.holdUsd6;
  return value > 0n ? value : 0n;
}

/**
 * On a Standard account only Perp USDC can fund HLP, so spendable USDC can
 * read as zero while the wallet plainly holds some. Without this the planner
 * would silently bridge and never say why.
 */
export function hlpStandardAccountHint(
  balance: HyperCoreSpendableUsdc | undefined,
): string | null {
  if (!balance || balance.mode !== 'standard') return null;
  if (spotSpendable(balance) <= 0n) return null;
  return 'On a Standard account only Perp USDC can fund HLP. Enable Unified Account on Hyperliquid, or move USDC from Spot to Perp there, then retry.';
}
