import { describe, expect, it, vi } from 'vitest';
import type { Address } from 'viem';

import type { LiFiAdapter } from '../../src/adapters/lifi.adapter.js';
import { buildBridgeTx } from '../../src/builders/bridge.builder.js';
import type { TransactionQuote } from '../../src/types/transaction.types.js';

const USER = '0x1111111111111111111111111111111111111111' as Address;
const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address;
const ETHEREUM_USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' as Address;

describe('buildBridgeTx', () => {
  it('requests a pure bridge quote to the user address on the destination chain', async () => {
    const quote: TransactionQuote = {
      transaction: {
        to: '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE',
        data: '0x1234',
        value: '0',
        chainId: 8453,
        gasLimit: '450000',
        meta: { intentType: 'BRIDGE' },
      },
      estimate: {
        fromAmount: '2000',
        toAmount: '1990',
        toAmountMin: '1980',
        gasCostUsd: '0.21',
        executionDuration: 3,
      },
      approval: {
        tokenAddress: BASE_USDC,
        spenderAddress: '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE',
        amount: '2000',
      },
      route: { tool: 'across' },
    };
    const getQuote = vi.fn().mockResolvedValue(quote);
    const adapter = { getQuote } as unknown as LiFiAdapter;

    await expect(
      buildBridgeTx(
        {
          fromChainId: 8453,
          toChainId: 1,
          fromToken: BASE_USDC,
          toToken: ETHEREUM_USDC,
          fromAmount: '2000',
          userAddress: USER,
        },
        adapter,
      ),
    ).resolves.toBe(quote);

    expect(getQuote).toHaveBeenCalledWith({
      fromChain: 8453,
      toChain: 1,
      fromToken: BASE_USDC,
      toToken: ETHEREUM_USDC,
      fromAmount: '2000',
      fromAddress: USER,
      toAddress: USER,
    });
  });

  it('rejects destination calls until cross-chain destination deposits are implemented', async () => {
    const adapter = { getQuote: vi.fn() } as unknown as LiFiAdapter;

    await expect(
      buildBridgeTx(
        {
          fromChainId: 8453,
          toChainId: 42161,
          fromToken: BASE_USDC,
          toToken: BASE_USDC,
          fromAmount: '2000',
          userAddress: USER,
          destinationCall: {
            to: '0x2222222222222222222222222222222222222222',
            data: '0xabcd',
            gasLimit: '200000',
          },
        },
        adapter,
      ),
    ).rejects.toThrow('Destination contract calls are out of scope for v1');
  });
});
