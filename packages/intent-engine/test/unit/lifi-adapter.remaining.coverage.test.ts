import * as lifiSdk from '@lifi/sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LiFiAdapter } from '../../src/adapters/lifi.adapter.js';
import { QuoteError } from '../../src/errors/intent.errors.js';

vi.mock('@lifi/sdk', () => ({
  createConfig: vi.fn(),
  getQuote: vi.fn(),
  getContractCallsQuote: vi.fn(),
  getToken: vi.fn(),
}));

describe('LiFiAdapter remaining coverage', () => {
  const config = {
    integrator: 'test-integrator',
    apiKey: 'test-api-key',
  };

  let adapter: LiFiAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new LiFiAdapter(config);
  });

  it(
    'sends toAmount without fromAmount for exact-output contract call quotes',
    async () => {
      const contractCalls = [
        {
          fromAmount: '1000000',
          fromTokenAddress: '0x0000000000000000000000000000000000000001' as const,
          toContractAddress:
            '0x00000000000000000000000000000000000000aa' as const,
          toContractCallData: '0x1234' as const,
          toContractGasLimit: '100000',
        },
      ];

      vi.mocked(lifiSdk.getContractCallsQuote).mockResolvedValueOnce({
        id: 'quote-exact-output',
        type: 'lifi',
        tool: 'composer',
        action: {
          fromChainId: 8453,
          toChainId: 8453,
          fromToken: {
            address: '0x0000000000000000000000000000000000000001',
            symbol: 'USDC',
            decimals: 6,
          },
          toToken: {
            address: '0x0000000000000000000000000000000000000002',
            symbol: 'vaultUSDC',
            decimals: 6,
          },
          fromAmount: '1000000',
        },
        estimate: {
          fromAmount: '1000000',
          toAmount: '990000',
          toAmountMin: '990000',
        },
        transactionRequest: {
          to: '0x00000000000000000000000000000000000000aa',
          data: '0xdeadbeef',
          value: '0x0',
        },
      } as unknown as never);

      await adapter.getContractCallQuote({
        fromChain: 8453,
        toChain: 8453,
        fromToken: '0x0000000000000000000000000000000000000001',
        toToken: '0x0000000000000000000000000000000000000002',
        toAmount: '990000',
        fromAddress: '0x000000000000000000000000000000000000abcd',
        contractCalls,
      });

      expect(lifiSdk.getContractCallsQuote).toHaveBeenCalledWith({
        fromChain: 8453,
        toChain: 8453,
        fromToken: '0x0000000000000000000000000000000000000001',
        toToken: '0x0000000000000000000000000000000000000002',
        fromAddress: '0x000000000000000000000000000000000000abcd',
        contractCalls,
        toAmount: '990000',
      });
      const request = vi.mocked(lifiSdk.getContractCallsQuote).mock.calls[0]?.[0];
      expect(request).not.toHaveProperty('fromAmount');
    },
  );

  it(
    'wraps LI.FI getToken failures in QuoteError and preserves the cause',
    async () => {
      const cause = new Error('LI.FI getToken failed');
      vi.mocked(lifiSdk.getToken).mockRejectedValueOnce(cause);

      let caught: unknown;
      try {
        await adapter.getTokenPrice(
          8453,
          '0x0000000000000000000000000000000000000001',
        );
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(QuoteError);
      expect(caught).toMatchObject({
        name: 'QuoteError',
        code: 'QUOTE_ERROR',
        message: 'Failed to get token price from LI.FI',
        cause,
      });
      expect(caught).toHaveProperty('cause', cause);
      expect(lifiSdk.getToken).toHaveBeenCalledWith(
        8453,
        '0x0000000000000000000000000000000000000001',
      );
    },
  );
});
