import { describe, expect, it } from 'vitest';

import {
  getMainnetChains,
  SUPPORTED_CHAINS,
} from '@/config/chains/definitions';
import type { BaseChainConfig } from '@/config/chains/types';

describe('SUPPORTED_CHAINS', () => {
  it('exports a non-empty array', () => {
    expect(Array.isArray(SUPPORTED_CHAINS)).toBe(true);
    expect(SUPPORTED_CHAINS.length).toBeGreaterThan(0);
  });

  it('every chain has required fields', () => {
    for (const chain of SUPPORTED_CHAINS) {
      expect(typeof chain.id).toBe('number');
      expect(typeof chain.name).toBe('string');
      expect(typeof chain.symbol).toBe('string');
      expect(chain.isSupported).toBe(true);
    }
  });

  it('contains Arbitrum One (chain id 42161)', () => {
    const arbitrum = SUPPORTED_CHAINS.find((c) => c.id === 42161);
    expect(arbitrum).toBeDefined();
    expect(arbitrum?.name).toBe('Arbitrum One');
    expect(arbitrum?.symbol).toBe('ARB');
  });

  it('contains Base (chain id 8453)', () => {
    const base = SUPPORTED_CHAINS.find((c) => c.id === 8453);
    expect(base).toBeDefined();
    expect(base?.name).toBe('Base');
  });

  it('contains Optimism (chain id 10)', () => {
    const optimism = SUPPORTED_CHAINS.find((c) => c.id === 10);
    expect(optimism).toBeDefined();
    expect(optimism?.name).toBe('Optimism');
  });

  it('every chain has rpcUrls with at least one http endpoint', () => {
    for (const chain of SUPPORTED_CHAINS) {
      expect(chain.rpcUrls.default.http.length).toBeGreaterThan(0);
      expect(chain.rpcUrls.public.http.length).toBeGreaterThan(0);
    }
  });

  it('every chain has blockExplorer and nativeCurrency', () => {
    for (const chain of SUPPORTED_CHAINS) {
      expect(chain.blockExplorers.default.url).toBeTruthy();
      expect(chain.nativeCurrency.decimals).toBe(18);
      expect(chain.nativeCurrency.symbol).toBe('ETH');
    }
  });

  it('every chain has metadata with blockTime and layer', () => {
    for (const chain of SUPPORTED_CHAINS) {
      expect(chain.metadata.blockTime).toBeGreaterThan(0);
      expect(typeof chain.metadata.layer).toBe('string');
    }
  });

  it('all chains are L2 with Ethereum as parent', () => {
    for (const chain of SUPPORTED_CHAINS) {
      expect(chain.metadata.layer).toBe('L2');
      expect(chain.metadata.parentChain).toBe(1);
    }
  });

  it('only includes chains where isSupported is true', () => {
    for (const chain of SUPPORTED_CHAINS) {
      expect(chain.isSupported).toBe(true);
    }
  });
});

describe('getMainnetChains', () => {
  const supportedA: BaseChainConfig = {
    id: 42161,
    name: 'Arbitrum One',
    rpcUrls: { default: { http: ['https://arb1.arbitrum.io/rpc'] } },
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    blockExplorers: {
      default: { name: 'Arbiscan', url: 'https://arbiscan.io' },
    },
    isSupported: true,
  } as BaseChainConfig;

  const supportedB: BaseChainConfig = {
    id: 1337,
    name: 'Local Dev',
    rpcUrls: { default: { http: ['http://localhost:8545'] } },
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    isSupported: true,
  } as BaseChainConfig;

  const unsupported: BaseChainConfig = {
    id: 5,
    name: 'Goerli',
    rpcUrls: { default: { http: ['https://goerli.infura.io'] } },
    nativeCurrency: { name: 'Goerli Ether', symbol: 'ETH', decimals: 18 },
    isSupported: false,
  } as BaseChainConfig;

  it('filters to only supported chains', () => {
    const result = getMainnetChains([supportedA, unsupported]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(42161);
  });

  it('returns empty array when no chains are supported', () => {
    expect(getMainnetChains([unsupported])).toEqual([]);
  });

  it('returns all chains when all are supported', () => {
    expect(getMainnetChains([supportedA, supportedB])).toHaveLength(2);
  });
});
