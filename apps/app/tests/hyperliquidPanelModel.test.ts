import {
  hlpAccountModeLabel,
  hlpSpendableUsd6,
  hlpStandardAccountHint,
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
  it('uses only the resolved spendable balance instead of combining pots', () => {
    expect(hlpSpendableUsd6(unified)).toBe(17_000_000n);
    expect(hlpSpendableUsd6(standard)).toBe(7_000_000n);
    expect(hlpSpendableUsd6(undefined)).toBeNull();
  });

  it('names the account mode the balance was resolved under', () => {
    expect(hlpAccountModeLabel(unified.mode)).toBe('Unified');
    expect(hlpAccountModeLabel(standard.mode)).toBe('Standard');
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
    expect(hlpStandardAccountHint(undefined)).toBeNull();
  });
});
