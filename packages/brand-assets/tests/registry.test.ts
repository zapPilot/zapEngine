import { readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  CHAIN_BRAND,
  chainBrandKeyForChainId,
  PROTOCOL_BRAND,
  protocolBrandKeyFor,
  TOKEN_BRAND,
  tokenBrandSymbolFor,
  type ChainBrandKey,
  type ProtocolBrandKey,
  type TokenBrandSymbol,
} from '../src/index.js';

const ASSETS = path.join(import.meta.dirname, '..', 'assets');

function assetKeys(category: string): string[] {
  return readdirSync(path.join(ASSETS, category))
    .filter((entry) => entry.endsWith('.png'))
    .map((entry) => path.basename(entry, '.png'));
}

describe('chainBrandKeyForChainId', () => {
  it('resolves every registered chain by its own id', () => {
    for (const key of Object.keys(CHAIN_BRAND) as ChainBrandKey[]) {
      expect(chainBrandKeyForChainId(CHAIN_BRAND[key].chainId)).toBe(key);
    }
  });

  it('resolves HyperCore, which no other chain map can express', () => {
    expect(chainBrandKeyForChainId(1337)).toBe('hyperliquid');
  });

  it.each([137, 0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'returns undefined for unknown or non-finite chain id %s',
    (chainId) => {
      expect(chainBrandKeyForChainId(chainId)).toBeUndefined();
    },
  );
});

describe('protocolBrandKeyFor', () => {
  it('resolves every registered protocol id', () => {
    for (const key of Object.keys(PROTOCOL_BRAND) as ProtocolBrandKey[]) {
      expect(protocolBrandKeyFor(key)).toBe(key);
    }
  });

  it.each([
    ['GMX', 'gmx-v2'],
    ['gmx_v2', 'gmx-v2'],
    ['GMX V2', 'gmx-v2'],
    ['  Morpho  ', 'morpho'],
    ['Morpho Blue', 'morpho'],
    ['Aave V3', 'aave'],
    ['Ondo Finance', 'ondo'],
    ['Lido Finance', 'lido'],
    ['ETH Staking', 'eth-staking'],
    ['HLP', 'hyperliquid'],
    ['Hyperliquid HLP', 'hyperliquid'],
    ['HyperCore', 'hyperliquid'],
  ])('normalizes %s to %s', (raw, expected) => {
    expect(protocolBrandKeyFor(raw)).toBe(expected);
  });

  it('collapses mixed separators before resolving an alias', () => {
    expect(protocolBrandKeyFor('  GMX___V--2  ')).toBe('gmx-v2');
    expect(protocolBrandKeyFor('\tHyperliquid   HLP\n')).toBe('hyperliquid');
  });

  it.each(['unknown-router', '', '   ', 'gmx-v3', '💸'])(
    'returns undefined for unknown protocol %s so callers can fall back',
    (protocol) => {
      expect(protocolBrandKeyFor(protocol)).toBeUndefined();
    },
  );
});

describe('tokenBrandSymbolFor', () => {
  it('resolves every registered symbol', () => {
    for (const symbol of Object.keys(TOKEN_BRAND) as TokenBrandSymbol[]) {
      expect(tokenBrandSymbolFor(symbol)).toBe(symbol);
    }
  });

  it.each([
    ['cbBTC', 'CBBTC'],
    ['usdc', 'USDC'],
    [' eth ', 'ETH'],
  ])('normalizes %s to %s', (raw, expected) => {
    expect(tokenBrandSymbolFor(raw)).toBe(expected);
  });

  it.each(['DOGE', '', '   ', 'US DC', '₿'])(
    'returns undefined for unknown symbol %s',
    (symbol) => {
      expect(tokenBrandSymbolFor(symbol)).toBeUndefined();
    },
  );
});

describe('registry entries', () => {
  it('gives every token a single-character fallback glyph', () => {
    for (const symbol of Object.keys(TOKEN_BRAND) as TokenBrandSymbol[]) {
      expect([...TOKEN_BRAND[symbol].glyph]).toHaveLength(1);
    }
  });

  it('gives every entry a six-digit lowercase hex fallback color', () => {
    const entries = [
      ...Object.values(CHAIN_BRAND),
      ...Object.values(TOKEN_BRAND),
      ...Object.values(PROTOCOL_BRAND),
    ];
    for (const entry of entries) {
      expect(entry.color).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

// The registry is allowed to name a key before its artwork exists, but shipped
// artwork with no key is unreachable dead weight.
describe('assets', () => {
  it.each([
    ['chains', Object.keys(CHAIN_BRAND)],
    ['protocols', Object.keys(PROTOCOL_BRAND)],
  ])('has no unregistered %s mark', (category, keys) => {
    expect(assetKeys(category).filter((key) => !keys.includes(key))).toEqual(
      [],
    );
  });

  it('has no unregistered token mark', () => {
    const registered = Object.keys(TOKEN_BRAND).map((symbol) =>
      symbol.toLowerCase(),
    );
    expect(
      assetKeys('tokens').filter((key) => !registered.includes(key)),
    ).toEqual([]);
  });
});
