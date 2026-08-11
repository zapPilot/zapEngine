import { describe, expect, it, vi } from 'vitest';
import type { Address, Hash } from 'viem';

import {
  BridgeQuoteUnavailableError,
  BridgeRouter,
} from '../../src/bridges/bridge-router.js';
import type { BridgeProvider } from '../../src/bridges/bridge-provider.js';
import type {
  BridgeProviderId,
  BridgeQuote,
} from '../../src/bridges/bridge.types.js';

const USER = '0x1111111111111111111111111111111111111111' as Address;
const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address;
const ARB_USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as Address;
const SOURCE_HASH = `0x${'1'.repeat(64)}` as Hash;

const request = {
  fromChainId: 8453,
  toChainId: 42161,
  fromToken: BASE_USDC,
  toToken: ARB_USDC,
  fromAmount: '1000000',
  sender: USER,
  recipient: USER,
};

function quote(
  provider: BridgeProviderId,
  overrides: Partial<BridgeQuote> = {},
): BridgeQuote {
  return {
    provider,
    fromChainId: 8453,
    toChainId: 42161,
    fromToken: BASE_USDC,
    toToken: ARB_USDC,
    fromAmount: '1000000',
    toAmount: '1000000',
    toAmountMin: '999000',
    feeUsd: '0',
    gasUsd: '0.01',
    estimatedDurationSec: 10,
    approvals: [],
    calls: [],
    providerData: {},
    ...overrides,
  };
}

function provider(
  id: BridgeProviderId,
  options: {
    supported?: boolean | Promise<boolean>;
    quote?: BridgeQuote;
    error?: Error;
  } = {},
): BridgeProvider {
  return {
    id,
    supports: vi.fn().mockReturnValue(options.supported ?? true),
    quote: options.error
      ? vi.fn().mockRejectedValue(options.error)
      : vi.fn().mockResolvedValue(options.quote ?? quote(id)),
    waitForCompletion: vi.fn().mockResolvedValue({
      status: 'settled',
      sourceTxHash: SOURCE_HASH,
    }),
  };
}

describe('BridgeRouter coverage', () => {
  it('fails with an empty failure list when no provider supports the route', async () => {
    const router = new BridgeRouter([
      provider('eco', { supported: false }),
      provider('across', { supported: Promise.resolve(false) }),
    ]);

    await expect(router.quote(request)).rejects.toMatchObject({
      name: 'BridgeQuoteUnavailableError',
      failures: [],
    });
  });

  it('preserves provider failures when every supported quote rejects', async () => {
    const ecoError = new Error('eco unavailable');
    const acrossError = new Error('across unavailable');
    const router = new BridgeRouter([
      provider('eco', { error: ecoError }),
      provider('across', { error: acrossError }),
    ]);

    try {
      await router.quote(request);
      throw new Error('expected quote to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(BridgeQuoteUnavailableError);
      expect((error as BridgeQuoteUnavailableError).failures).toEqual([
        { provider: 'eco', error: ecoError },
        { provider: 'across', error: acrossError },
      ]);
    }
  });

  it('prefers Eco inside the one-cent effective-value tie window', async () => {
    const router = new BridgeRouter([
      provider('across', {
        quote: quote('across', { estimatedDurationSec: 1 }),
      }),
      provider('eco', {
        quote: quote('eco', { estimatedDurationSec: 100 }),
      }),
    ]);

    const selection = await router.quote(request);
    expect(selection.selected.provider).toBe('eco');
    expect(selection.alternatives.map((item) => item.provider)).toEqual([
      'across',
    ]);
  });

  it('uses duration as the final tie breaker for non-Eco providers', async () => {
    const router = new BridgeRouter([
      provider('across', {
        quote: quote('across', { estimatedDurationSec: 20 }),
      }),
      provider('lifi', {
        quote: quote('lifi', { estimatedDurationSec: 5 }),
      }),
    ]);

    expect((await router.quote(request)).selected.provider).toBe('lifi');
  });

  it('returns configured providers and rejects unknown provider ids', () => {
    const eco = provider('eco');
    const router = new BridgeRouter([eco]);

    expect(router.getProvider('eco')).toBe(eco);
    expect(() => router.getProvider('across')).toThrow(
      'Bridge provider across is not configured',
    );
  });
});
