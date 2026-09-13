import {
  belowHlpMinimum,
  hlpAccountModeLabel,
  hlpBalanceLabel,
  hlpBalanceRows,
  hlpDoneStatusLabel,
  hlpSpendableUsd6,
  hlpStandardAccountHint,
  HYPERLIQUID_HLP_SPLIT,
  MIN_HYPERLIQUID_DEPOSIT_USD6,
} from '@/integration/hyperliquidPanelModel';
import type { HyperCoreSpendableUsdc } from '@zapengine/app-core/services';
import { describe, expect, it } from 'vitest';

const unified: HyperCoreSpendableUsdc = {
  mode: 'unified',
  rawAbstraction: 'unifiedAccount',
  spendableUsd6: 17_000_000n,
  spot: { totalUsd6: 20_000_000n, holdUsd6: 3_000_000n },
  perp: { withdrawableUsd6: 99_000_000n, accountValueUsd6: 100_000_000n },
};

const standard: HyperCoreSpendableUsdc = {
  mode: 'standard',
  rawAbstraction: 'disabled',
  spendableUsd6: 7_000_000n,
  spot: { totalUsd6: 20_000_000n, holdUsd6: 0n },
  perp: { withdrawableUsd6: 7_000_000n, accountValueUsd6: 8_000_000n },
};

describe('hyperliquidPanelModel', () => {
  it('preserves the dormant bridge route to HyperCore', () => {
    expect(HYPERLIQUID_HLP_SPLIT).toEqual({ 1337: 1 });
  });

  it('enforces the official 10 USDC minimum', () => {
    expect(MIN_HYPERLIQUID_DEPOSIT_USD6).toBe(10_000_000n);
    expect(belowHlpMinimum('9999999')).toBe(true);
    expect(belowHlpMinimum('10000000')).toBe(false);
    expect(belowHlpMinimum('0')).toBe(false);
  });

  it('formats balance state without treating zero as missing', () => {
    const base = { isConnected: true, isLoading: false, isError: false };
    expect(hlpBalanceLabel({ ...base, value: 14_625_485n })).toBe(
      '14.625485 USDC',
    );
    expect(hlpBalanceLabel({ ...base, value: 0n })).toBe('0 USDC');
    expect(
      hlpBalanceLabel({ ...base, isLoading: true, value: undefined }),
    ).toBe('Loading…');
    expect(hlpBalanceLabel({ ...base, isError: true, value: undefined })).toBe(
      '—',
    );
  });

  it('uses only the resolved spendable balance instead of combining pots', () => {
    expect(hlpSpendableUsd6(unified)).toBe(17_000_000n);
    expect(hlpSpendableUsd6(standard)).toBe(7_000_000n);
    expect(hlpSpendableUsd6(undefined)).toBeNull();
  });

  it('shows mode-specific balance rows', () => {
    expect(hlpAccountModeLabel(unified.mode)).toBe('Unified');
    expect(hlpBalanceRows(unified)).toEqual([
      { label: 'USDC balance', value: 20_000_000n },
      { label: 'On hold', value: 3_000_000n },
      { label: 'Spendable', value: 17_000_000n },
    ]);
    expect(hlpAccountModeLabel(standard.mode)).toBe('Standard');
    expect(hlpBalanceRows(standard)).toEqual([
      { label: 'Spot USDC', value: 20_000_000n },
      { label: 'Perp USDC withdrawable', value: 7_000_000n },
      { label: 'Perp account value', value: 8_000_000n },
    ]);
  });

  it('guides Standard spot-only users instead of silently class-transferring', () => {
    expect(hlpStandardAccountHint(standard)).toContain('Standard account');
    expect(hlpStandardAccountHint(unified)).toBeNull();
    expect(
      hlpStandardAccountHint({
        ...standard,
        spot: { totalUsd6: 0n, holdUsd6: 0n },
      }),
    ).toBeNull();
  });

  it('separates confirmed from submitted-unverified HLP deposits', () => {
    expect(hlpDoneStatusLabel('deposited')).toBe('Deposited (incl. HLP)');
    expect(hlpDoneStatusLabel('submittedUnverified')).toBe(
      'HLP deposit submitted — awaiting confirmation',
    );
  });
});
