import { describe, expect, it } from 'vitest';

import {
  DEFAULT_VAULT_REGISTRY,
  findVaultByAddress,
  lookupVault,
  ProtocolIdSchema,
} from '../../src/protocols/registry.js';
import {
  getGmxV2Market,
  GMX_V2_MARKETS,
  GMX_V2_TOKENS,
} from '../../src/protocols/gmx-v2/index.js';

describe('GMX v2 registry integration', () => {
  it('keeps morpho valid and adds gmx-v2 as a protocol id', () => {
    expect(ProtocolIdSchema.parse('morpho')).toBe('morpho');
    expect(ProtocolIdSchema.parse('gmx-v2')).toBe('gmx-v2');
  });

  it('adds the GMX v2 catalog source to the default vault registry', () => {
    expect(DEFAULT_VAULT_REGISTRY.map((source) => source.protocol)).toContain(
      'gmx-v2',
    );
  });

  it.each(Object.keys(GMX_V2_MARKETS) as Array<keyof typeof GMX_V2_MARKETS>)(
    'resolves %s through market and vault lookups',
    (marketKey) => {
      const market = getGmxV2Market(marketKey);

      expect(market.key).toBe(marketKey);
      expect(market.marketToken).toBe(GMX_V2_MARKETS[marketKey].marketToken);

      const byAddress = findVaultByAddress({
        protocol: 'gmx-v2',
        chainId: 42161,
        vaultAddress: market.marketToken,
      });
      expect(byAddress?.vaultAddress).toBe(market.marketToken);

      const byAsset = lookupVault({
        protocol: 'gmx-v2',
        chainId: 42161,
        asset: GMX_V2_TOKENS.USDC.address,
      });
      expect(byAsset?.assetAddress).toBe(GMX_V2_TOKENS.USDC.address);
    },
  );
});
