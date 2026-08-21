import {
  belowHlpMinimum,
  hlpDoneStatusLabel,
  hlpErrorAction,
  HYPERLIQUID_HLP_SPLIT,
  MIN_HYPERLIQUID_DEPOSIT_USD6,
} from '@/integration/hyperliquidPanelModel';
import { describe, expect, it } from 'vitest';

const HYPERCORE_CHAIN_ID = 1337;

describe('hyperliquidPanelModel', () => {
  it('routes the whole deposit to HyperCore instead of the backend default', () => {
    expect(HYPERLIQUID_HLP_SPLIT).toEqual({ [HYPERCORE_CHAIN_ID]: 1 });
  });

  it('flags amounts that cannot survive bridge fees above the $5 vault minimum', () => {
    expect(MIN_HYPERLIQUID_DEPOSIT_USD6).toBe(6_000_000n);
    expect(belowHlpMinimum('5990000')).toBe(true);
    expect(belowHlpMinimum('6000000')).toBe(false);
    expect(belowHlpMinimum('10000000')).toBe(false);
    // An empty amount field is not a minimum violation.
    expect(belowHlpMinimum('0')).toBe(false);
  });

  it('separates a confirmed HLP deposit from an unverified one', () => {
    expect(hlpDoneStatusLabel('deposited')).toBe('Deposited (incl. HLP)');
    expect(hlpDoneStatusLabel('submittedUnverified')).toBe(
      'HLP deposit submitted — awaiting confirmation',
    );
    expect(hlpDoneStatusLabel('arrived')).toBe('Deposited');
  });

  it('offers a retry only for the repeatable HLP deposit stage', () => {
    expect(hlpErrorAction('hyperliquidDeposit')).toBe('retry');
    expect(hlpErrorAction('sourceExecution')).toBe('reset');
    expect(hlpErrorAction('bridging')).toBe('reset');
    expect(hlpErrorAction('configure')).toBe('reset');
    expect(hlpErrorAction('done')).toBe('reset');
  });
});
