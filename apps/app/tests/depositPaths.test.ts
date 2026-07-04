import { describe, expect, it } from 'vitest';

import {
  DEFAULT_DEPOSIT_PATH,
  DEPOSIT_PATHS,
  depositPathChainLabel,
  depositPathProtocolLabel,
  gmxMarketOptions,
  isGmxDepositPath,
} from '@/integration/depositPaths';

describe('deposit path helpers', () => {
  it('defaults to the Base invest path and labels protocols clearly', () => {
    expect(DEFAULT_DEPOSIT_PATH.kind).toBe('base-invest');
    expect(depositPathProtocolLabel(DEFAULT_DEPOSIT_PATH)).toBe(
      'Base Morpho / Invest',
    );
    expect(depositPathChainLabel(DEFAULT_DEPOSIT_PATH)).toBe('Base');
  });

  it('exposes all GMX v2 dev markets as Arbitrum paths', () => {
    expect(gmxMarketOptions.map((market) => market.key)).toEqual([
      'btc-btc',
      'eth-eth',
      'btc-usdc',
      'eth-usdc',
    ]);
    expect(DEPOSIT_PATHS.filter(isGmxDepositPath)).toHaveLength(4);
    expect(
      DEPOSIT_PATHS.filter(isGmxDepositPath).map(depositPathChainLabel),
    ).toEqual(['Arbitrum', 'Arbitrum', 'Arbitrum', 'Arbitrum']);
  });
});
