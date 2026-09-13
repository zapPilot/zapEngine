import type {
  HyperCoreAccountMode,
  HyperCoreSpendableUsdc,
} from '@zapengine/app-core/services';
import type { WizardHlpStatus } from '@zapengine/app-core/lib/wallet/depositWizardMachine';
import { formatUnits } from 'viem';

/** Hyperliquid's HLP vault minimum: $10 in 6-decimal USD. */
export const MIN_HYPERLIQUID_DEPOSIT_USD6 = 10_000_000n;

export function belowHlpMinimum(fromAmountUsd6: string): boolean {
  const amount = BigInt(fromAmountUsd6);
  return amount > 0n && amount < MIN_HYPERLIQUID_DEPOSIT_USD6;
}

/** Completion-card status line — the HLP leg may end unconfirmed. */
export function hlpDoneStatusLabel(status: WizardHlpStatus): string {
  if (status === 'deposited') return 'Deposited (incl. HLP)';
  if (status === 'submittedUnverified') {
    return 'HLP deposit submitted — awaiting confirmation';
  }
  return 'Deposited';
}

export function hlpBalanceLabel({
  isConnected,
  isLoading,
  isError,
  value,
}: {
  isConnected: boolean;
  isLoading: boolean;
  isError: boolean;
  value: bigint | undefined;
}): string {
  if (!isConnected) return '—';
  if (isLoading) return 'Loading…';
  if (isError || value === undefined) return '—';
  return `${formatUnits(value, 6)} USDC`;
}

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

export function hlpStandardAccountHint(
  balance: HyperCoreSpendableUsdc | undefined,
): string | null {
  if (!balance || balance.mode !== 'standard') return null;
  if (spotSpendable(balance) <= 0n) return null;
  return 'On a Standard account only Perp USDC can fund HLP. Enable Unified Account on Hyperliquid, or move USDC from Spot to Perp there, then retry.';
}

export interface HlpBalanceRow {
  label: string;
  value: bigint;
}

export function hlpBalanceRows(
  balance: HyperCoreSpendableUsdc,
): HlpBalanceRow[] {
  if (balance.mode === 'unified') {
    return [
      { label: 'USDC balance', value: balance.spot.totalUsd6 },
      ...(balance.spot.holdUsd6 > 0n
        ? [{ label: 'On hold', value: balance.spot.holdUsd6 }]
        : []),
      { label: 'Spendable', value: balance.spendableUsd6 },
    ];
  }
  return [
    { label: 'Spot USDC', value: balance.spot.totalUsd6 },
    { label: 'Perp USDC withdrawable', value: balance.perp.withdrawableUsd6 },
    { label: 'Perp account value', value: balance.perp.accountValueUsd6 },
  ];
}
