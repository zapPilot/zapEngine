import {
  belowHlpMinimum,
  hlpBalanceLabel,
  hlpDoneStatusLabel,
  HYPERLIQUID_HLP_SPLIT,
  MIN_HYPERLIQUID_DEPOSIT_USD6,
} from '@/integration/hyperliquidPanelModel';
import { describe, expect, it } from 'vitest';

const HYPERCORE_CHAIN_ID = 1337;

describe('hyperliquidPanelModel', () => {
  it('routes the whole deposit to HyperCore instead of the backend default', () => {
    expect(HYPERLIQUID_HLP_SPLIT).toEqual({ [HYPERCORE_CHAIN_ID]: 1 });
  });

  it('enforces the official 10 USDC HLP minimum at the input floor', () => {
    expect(MIN_HYPERLIQUID_DEPOSIT_USD6).toBe(10_000_000n);
    expect(belowHlpMinimum('9999999')).toBe(true);
    expect(belowHlpMinimum('10000000')).toBe(false);
    expect(belowHlpMinimum('12000000')).toBe(false);
    // An empty amount field is not a minimum violation.
    expect(belowHlpMinimum('0')).toBe(false);
  });

  it('renders a HyperCore balance row per pot state', () => {
    const base = { isConnected: true, isLoading: false, isError: false };

    expect(hlpBalanceLabel({ ...base, value: 14_625_485n })).toBe(
      '14.625485 USDC',
    );
    // Zero is a real balance, not a missing one.
    expect(hlpBalanceLabel({ ...base, value: 0n })).toBe('0 USDC');
    expect(
      hlpBalanceLabel({ ...base, isLoading: true, value: undefined }),
    ).toBe('Loading…');
    expect(hlpBalanceLabel({ ...base, isError: true, value: undefined })).toBe(
      '—',
    );
    // A disconnected wallet wins over a still-pending query.
    expect(
      hlpBalanceLabel({
        isConnected: false,
        isLoading: true,
        isError: false,
        value: 1n,
      }),
    ).toBe('—');
  });

  it('separates a confirmed HLP deposit from an unverified one', () => {
    expect(hlpDoneStatusLabel('deposited')).toBe('Deposited (incl. HLP)');
    expect(hlpDoneStatusLabel('submittedUnverified')).toBe(
      'HLP deposit submitted — awaiting confirmation',
    );
    expect(hlpDoneStatusLabel('arrived')).toBe('Deposited');
  });
});
