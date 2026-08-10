import { describe, expect, it, vi } from 'vitest';
import type { Address } from 'viem';

import type { BridgeRouter } from '../../src/bridges/bridge-router.js';
import type { BridgeQuote } from '../../src/bridges/bridge.types.js';
import { buildBridgeTx } from '../../src/builders/bridge.builder.js';

const USER = '0x1111111111111111111111111111111111111111' as Address;
const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address;
const ARBITRUM_USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as Address;

const quote: BridgeQuote = {
  provider: 'eco',
  fromChainId: 8453,
  toChainId: 42161,
  fromToken: BASE_USDC,
  toToken: ARBITRUM_USDC,
  fromAmount: '2000',
  toAmount: '2000',
  toAmountMin: '2000',
  feeUsd: '0',
  gasUsd: '0.01',
  estimatedDurationSec: 3,
  approvals: [],
  calls: [],
  providerData: {},
};

describe('buildBridgeTx', () => {
  it('requests a provider-neutral quote to the user destination address', async () => {
    const routerQuote = vi
      .fn()
      .mockResolvedValue({ selected: quote, alternatives: [] });
    const router = { quote: routerQuote } as unknown as BridgeRouter;

    await expect(
      buildBridgeTx(
        {
          fromChainId: 8453,
          toChainId: 42161,
          fromToken: BASE_USDC,
          toToken: ARBITRUM_USDC,
          fromAmount: '2000',
          userAddress: USER,
        },
        router,
      ),
    ).resolves.toBe(quote);

    expect(routerQuote).toHaveBeenCalledWith({
      fromChainId: 8453,
      toChainId: 42161,
      fromToken: BASE_USDC,
      toToken: ARBITRUM_USDC,
      fromAmount: '2000',
      sender: USER,
      recipient: USER,
    });
  });

  it('rejects destination calls until cross-chain destination deposits are implemented', async () => {
    const router = { quote: vi.fn() } as unknown as BridgeRouter;
    await expect(
      buildBridgeTx(
        {
          fromChainId: 8453,
          toChainId: 42161,
          fromToken: BASE_USDC,
          toToken: ARBITRUM_USDC,
          fromAmount: '2000',
          userAddress: USER,
          destinationCall: {
            to: '0x2222222222222222222222222222222222222222',
            data: '0xabcd',
            gasLimit: '200000',
          },
        },
        router,
      ),
    ).rejects.toThrow('Destination contract calls are out of scope for v1');
  });
});
