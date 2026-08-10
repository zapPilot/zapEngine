import { describe, expect, it, vi } from 'vitest';
import type { Address } from 'viem';

import { LiFiBridgeAdapter } from '../../src/adapters/lifi-bridge.adapter.js';
import type { BridgeProvider } from '../../src/bridges/bridge-provider.js';
import {
  BridgeQuoteUnavailableError,
  BridgeRouter,
} from '../../src/bridges/bridge-router.js';
import type {
  BridgeProviderId,
  BridgeQuote,
  BridgeQuoteRequest,
} from '../../src/bridges/bridge.types.js';

const TOKEN = '0x1111111111111111111111111111111111111111' as Address;
const USER = '0x2222222222222222222222222222222222222222' as Address;
const request: BridgeQuoteRequest = {
  fromChainId: 8453,
  toChainId: 42161,
  fromToken: TOKEN,
  toToken: TOKEN,
  fromAmount: '100000000',
  sender: USER,
  recipient: USER,
};

function quote(
  provider: BridgeProviderId,
  toAmount: string,
  gasUsd: string,
  duration: number,
): BridgeQuote {
  return {
    provider,
    fromChainId: request.fromChainId,
    toChainId: request.toChainId,
    fromToken: request.fromToken,
    toToken: request.toToken,
    fromAmount: request.fromAmount,
    toAmount,
    toAmountMin: toAmount,
    feeUsd: '0',
    gasUsd,
    estimatedDurationSec: duration,
    approvals: [],
    calls: [],
    providerData: {},
  };
}

function provider(
  id: BridgeProviderId,
  result: BridgeQuote | Error,
): BridgeProvider {
  return {
    id,
    supports: vi.fn().mockReturnValue(true),
    quote: vi
      .fn()
      .mockImplementation(() =>
        result instanceof Error
          ? Promise.reject(result)
          : Promise.resolve(result),
      ),
    waitForCompletion: vi.fn(),
  };
}

describe('BridgeRouter', () => {
  it('keeps the dormant LI.FI provider outside canonical Base-Arbitrum USDC', () => {
    const adapter = new LiFiBridgeAdapter({} as never);
    expect(
      adapter.supports({
        ...request,
        fromToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        toToken: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
      }),
    ).toBe(false);
    expect(adapter.supports(request)).toBe(true);
  });

  it('selects the highest effective output after source gas', async () => {
    const router = new BridgeRouter([
      provider('eco', quote('eco', '100000000', '0.02', 7)),
      provider('across', quote('across', '99999000', '0.001', 2)),
    ]);
    const selection = await router.quote(request);
    expect(selection.selected.provider).toBe('across');
    expect(selection.alternatives[0]?.provider).toBe('eco');
  });

  it('prefers Eco inside the one-cent economic tie window', async () => {
    const router = new BridgeRouter([
      provider('eco', quote('eco', '100000000', '0.005', 7)),
      provider('across', quote('across', '100000000', '0.001', 2)),
    ]);
    expect((await router.quote(request)).selected.provider).toBe('eco');
  });

  it('isolates provider failures and uses the surviving quote', async () => {
    const router = new BridgeRouter([
      provider('eco', new Error('timeout')),
      provider('across', quote('across', '99990000', '0.001', 2)),
    ]);
    expect((await router.quote(request)).selected.provider).toBe('across');
  });

  it('throws a normalized unavailable error when all providers fail', async () => {
    const router = new BridgeRouter([
      provider('eco', new Error('eco down')),
      provider('across', new Error('across down')),
    ]);
    await expect(router.quote(request)).rejects.toBeInstanceOf(
      BridgeQuoteUnavailableError,
    );
  });
});
