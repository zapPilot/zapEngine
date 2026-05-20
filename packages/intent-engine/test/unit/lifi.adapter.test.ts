import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PreparedTransactionSchema } from '@zapengine/types/api';
import { LiFiAdapter } from '../../src/adapters/lifi.adapter.js';
import { QuoteError } from '../../src/errors/intent.errors.js';
import * as lifiSdk from '@lifi/sdk';

// Mock the @lifi/sdk
vi.mock('@lifi/sdk', () => {
  return {
    createConfig: vi.fn(),
    getQuote: vi.fn(),
    getContractCallsQuote: vi.fn(),
    getToken: vi.fn(),
  };
});

describe('LiFiAdapter', () => {
  const config = {
    integrator: 'test-integrator',
    apiKey: 'test-api-key',
  };

  let adapter: LiFiAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new LiFiAdapter(config);
  });

  function makeQuoteWithTransactionRequest(transactionRequest: {
    to: string;
    data: string;
    value?: string;
    gasLimit?: string;
  }) {
    return {
      id: 'quote-quantity',
      type: 'lifi',
      tool: 'test',
      action: {
        fromChainId: 8453,
        toChainId: 8453,
        fromToken: {
          address: '0x0000000000000000000000000000000000000001',
          symbol: 'A',
          decimals: 18,
        },
        toToken: {
          address: '0x0000000000000000000000000000000000000002',
          symbol: 'B',
          decimals: 18,
        },
        fromAmount: '100000',
      },
      estimate: {
        fromAmount: '100000',
        toAmount: '99000',
        toAmountMin: '98000',
      },
      transactionRequest,
    };
  }

  async function getSwapQuoteWithTransactionRequest(transactionRequest: {
    to: string;
    data: string;
    value?: string;
    gasLimit?: string;
  }) {
    vi.mocked(lifiSdk.getQuote).mockResolvedValueOnce(
      makeQuoteWithTransactionRequest(transactionRequest) as unknown as never,
    );

    return adapter.getSwapQuote({
      fromChain: 8453,
      toChain: 8453,
      fromToken: '0x0000000000000000000000000000000000000001',
      toToken: '0x0000000000000000000000000000000000000002',
      fromAmount: '100000',
      fromAddress: '0x000000000000000000000000000000000000abcd',
    });
  }

  describe('Initialization', () => {
    it('should initialize the SDK only once on first call', async () => {
      vi.mocked(lifiSdk.getQuote).mockResolvedValue({
        id: '1',
        type: 'lifi',
        tool: 'test',
        action: {
          fromChainId: 1,
          toChainId: 1,
          fromToken: { address: '0x1', symbol: 'A', decimals: 18 },
          toToken: { address: '0x2', symbol: 'B', decimals: 18 },
          fromAmount: '100',
        },
        estimate: { fromAmount: '100', toAmount: '99', toAmountMin: '98' },
        transactionRequest: {
          to: '0x123',
          data: '0xdata',
          value: '0x0',
          gasLimit: '0x186a0', // 100000 decimal
        },
      } as unknown as never);

      const params = {
        fromChain: 1,
        toChain: 1,
        fromToken: '0x1' as const,
        toToken: '0x2' as const,
        fromAmount: '100',
        fromAddress: '0xabc' as const,
      };

      await adapter.getSwapQuote(params);
      expect(lifiSdk.createConfig).toHaveBeenCalledTimes(1);
      expect(lifiSdk.createConfig).toHaveBeenCalledWith({
        integrator: config.integrator,
        apiKey: config.apiKey,
      });

      await adapter.getSwapQuote(params);
      // Should still be 1, because initialized = true
      expect(lifiSdk.createConfig).toHaveBeenCalledTimes(1);
    });
  });

  describe('getSwapQuote', () => {
    const params = {
      fromChain: 1,
      toChain: 1,
      fromToken: '0x1' as const,
      toToken: '0x2' as const,
      fromAmount: '100',
      fromAddress: '0xabc' as const,
      slippageBps: 50,
    };

    it('should return a mapped transaction quote on success', async () => {
      const mockQuote = {
        id: 'quote-123',
        type: 'lifi',
        tool: 'test',
        action: {
          fromChainId: 1,
          toChainId: 1,
          fromToken: { address: '0x1', symbol: 'A', decimals: 18 },
          toToken: { address: '0x2', symbol: 'B', decimals: 18 },
          fromAmount: '100',
        },
        estimate: {
          fromAmount: '100',
          toAmount: '99',
          toAmountMin: '98',
          executionDuration: 30,
          gasCosts: [{ amountUSD: '0.5' }],
        },
        transactionRequest: {
          to: '0xdef',
          data: '0xdata',
          value: '0xa', // 10 decimal
          gasLimit: '0x30d40', // 200000 decimal
        },
      };

      vi.mocked(lifiSdk.getQuote).mockResolvedValue(
        mockQuote as unknown as never,
      );

      const result = await adapter.getSwapQuote(params);

      expect(lifiSdk.getQuote).toHaveBeenCalledWith({
        fromChain: 1,
        toChain: 1,
        fromToken: '0x1',
        toToken: '0x2',
        fromAmount: '100',
        fromAddress: '0xabc',
        toAddress: '0xabc',
        slippage: 0.005,
      });

      expect(result.transaction.to).toBe('0xdef');
      expect(result.transaction.data).toBe('0xdata');
      expect(result.transaction.value).toBe('10');
      expect(result.transaction.gasLimit).toBe('200000');
      expect(result.transaction.meta?.intentType).toBe('SWAP');
    });

    it('should throw QuoteError when API fails', async () => {
      vi.mocked(lifiSdk.getQuote).mockRejectedValue(new Error('API Error'));

      await expect(adapter.getSwapQuote(params)).rejects.toThrow(QuoteError);
      await expect(adapter.getSwapQuote(params)).rejects.toThrow(
        'Failed to get quote from LI.FI',
      );
    });

    it('normalizes hex-string value/gasLimit from LI.FI into base-unit decimal strings', async () => {
      const lifiHexQuote = {
        id: 'q-hex',
        type: 'lifi',
        tool: 'across',
        action: {
          fromChainId: 8453,
          toChainId: 8453,
          fromToken: { address: '0x1', symbol: 'A', decimals: 18 },
          toToken: { address: '0x2', symbol: 'B', decimals: 18 },
          fromAmount: '100000000000000000',
        },
        estimate: {
          fromAmount: '100000000000000000',
          toAmount: '99000000000000000',
          toAmountMin: '98500000000000000',
          executionDuration: 30,
          gasCosts: [{ amountUSD: '0.42' }],
        },
        transactionRequest: {
          to: '0x0000000000000000000000000000000000000abc',
          data: '0xdeadbeef',
          value: '0x16345785d8a0000', // hex form of 100000000000000000
          gasLimit: '0x186a0', // hex form of 100000
        },
      };

      vi.mocked(lifiSdk.getQuote).mockResolvedValue(
        lifiHexQuote as unknown as never,
      );

      const result = await adapter.getSwapQuote({
        fromChain: 8453,
        toChain: 8453,
        fromToken: '0x0000000000000000000000000000000000000001' as const,
        toToken: '0x0000000000000000000000000000000000000002' as const,
        fromAmount: '100000000000000000',
        fromAddress: '0x000000000000000000000000000000000000abcd' as const,
      });

      expect(result.transaction.value).toBe('100000000000000000');
      expect(result.transaction.gasLimit).toBe('100000');
      expect(result.transaction.meta.estimatedGas).toBe('100000');

      // Regression lock: the resulting transaction must satisfy the shared schema.
      expect(() =>
        PreparedTransactionSchema.parse(result.transaction),
      ).not.toThrow();
    });

    it.each([
      { value: '', expectedValue: '0', label: 'empty string' },
      { value: '0x', expectedValue: '0', label: 'empty hex quantity' },
      { value: undefined, expectedValue: '0', label: 'missing value' },
    ])(
      'normalizes $label LI.FI value to the schema default zero',
      async ({ value, expectedValue }) => {
        const result = await getSwapQuoteWithTransactionRequest({
          to: '0x0000000000000000000000000000000000000abc',
          data: '0xdeadbeef',
          value,
          gasLimit: '',
        });

        expect(result.transaction.value).toBe(expectedValue);
        expect(result.transaction.gasLimit).toBeUndefined();
        expect(result.transaction.meta.estimatedGas).toBeUndefined();
        expect(() =>
          PreparedTransactionSchema.parse(result.transaction),
        ).not.toThrow();
      },
    );

    it('passes decimal-string quantities through unchanged', async () => {
      const result = await getSwapQuoteWithTransactionRequest({
        to: '0x0000000000000000000000000000000000000abc',
        data: '0xdeadbeef',
        value: '100000',
        gasLimit: '300000',
      });

      expect(result.transaction.value).toBe('100000');
      expect(result.transaction.gasLimit).toBe('300000');
      expect(result.transaction.meta.estimatedGas).toBe('300000');
      expect(() =>
        PreparedTransactionSchema.parse(result.transaction),
      ).not.toThrow();
    });

    it('normalizes large hex quantities without precision loss', async () => {
      const largeHex = '0xffffffffffffffffffffffffffffffffffffffff';
      const expectedLargeDecimal = BigInt(largeHex).toString(10);

      const result = await getSwapQuoteWithTransactionRequest({
        to: '0x0000000000000000000000000000000000000abc',
        data: '0xdeadbeef',
        value: largeHex,
        gasLimit: largeHex,
      });

      expect(result.transaction.value).toBe(expectedLargeDecimal);
      expect(result.transaction.gasLimit).toBe(expectedLargeDecimal);
      expect(result.transaction.meta.estimatedGas).toBe(expectedLargeDecimal);
      expect(() =>
        PreparedTransactionSchema.parse(result.transaction),
      ).not.toThrow();
    });
  });

  describe('getQuote', () => {
    it('can request a LI.FI Earn vault quote with exact source amount', async () => {
      const mockQuote = {
        id: 'quote-earn',
        type: 'lifi',
        tool: 'composer',
        action: {
          fromChainId: 8453,
          toChainId: 8453,
          fromToken: {
            address: '0x0000000000000000000000000000000000000000',
            symbol: 'ETH',
            decimals: 18,
          },
          toToken: {
            address: '0x7bfa7c4f149e7415b73bdedfe609237e29cbf34a',
            symbol: 'sparkUSDC',
            decimals: 18,
          },
          fromAmount: '1000000000000000',
        },
        estimate: {
          fromAmount: '1000000000000000',
          toAmount: '2318396521802239673',
          toAmountMin: '2306804539193228474',
          executionDuration: 0,
          gasCosts: [{ amountUSD: '0.0193' }],
        },
        transactionRequest: {
          to: '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE',
          data: '0xdeadbeef',
          value: '0x38d7ea4c68000',
          gasLimit: '0x223722',
        },
      };

      vi.mocked(lifiSdk.getQuote).mockResolvedValue(
        mockQuote as unknown as never,
      );

      const result = await adapter.getQuote({
        fromChain: 8453,
        toChain: 8453,
        fromToken: '0x0000000000000000000000000000000000000000',
        toToken: '0x7BfA7C4f149E7415b73bdeDfe609237e29CBF34A',
        fromAmount: '1000000000000000',
        fromAddress: '0x000000000000000000000000000000000000abcd',
        intentType: 'SUPPLY',
      });

      expect(lifiSdk.getQuote).toHaveBeenCalledWith({
        fromChain: 8453,
        toChain: 8453,
        fromToken: '0x0000000000000000000000000000000000000000',
        toToken: '0x7BfA7C4f149E7415b73bdeDfe609237e29CBF34A',
        fromAmount: '1000000000000000',
        fromAddress: '0x000000000000000000000000000000000000abcd',
        toAddress: '0x000000000000000000000000000000000000abcd',
        slippage: 0.005,
      });
      expect(result.transaction.to).toBe(
        '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE',
      );
      expect(result.transaction.value).toBe('1000000000000000');
      expect(result.transaction.meta.intentType).toBe('SUPPLY');
      expect(result.estimate.toAmountMin).toBe('2306804539193228474');
      expect(result.approval).toBeUndefined();
    });
  });

  describe('getTokenPrice', () => {
    it('returns token price metadata from LI.FI getToken', async () => {
      vi.mocked(lifiSdk.getToken).mockResolvedValueOnce({
        chainId: 8453,
        address: '0x0000000000000000000000000000000000000000',
        symbol: 'ETH',
        name: 'Ethereum',
        decimals: 18,
        priceUSD: '3210.42',
      } as unknown as never);

      const result = await adapter.getTokenPrice(
        8453,
        '0x0000000000000000000000000000000000000000',
      );

      expect(lifiSdk.createConfig).toHaveBeenCalledWith({
        integrator: config.integrator,
        apiKey: config.apiKey,
      });
      expect(lifiSdk.getToken).toHaveBeenCalledWith(
        8453,
        '0x0000000000000000000000000000000000000000',
      );
      expect(result).toEqual({
        address: '0x0000000000000000000000000000000000000000',
        symbol: 'ETH',
        decimals: 18,
        priceUSD: '3210.42',
      });
    });
  });

  describe('getContractCallQuote', () => {
    const params = {
      fromChain: 1,
      toChain: 1,
      fromToken: '0x1' as const,
      toToken: '0x2' as const,
      toAmount: '100',
      fromAddress: '0xabc' as const,
      contractCalls: [
        {
          fromAmount: '100',
          fromTokenAddress: '0x1' as const,
          toContractAddress: '0xdef' as const,
          toContractCallData: '0x1234' as const,
          toContractGasLimit: '100000',
        },
      ],
    };

    it('should return a mapped transaction quote for contract calls on success', async () => {
      const mockQuote = {
        id: 'quote-456',
        type: 'lifi',
        tool: 'test',
        action: {
          fromChainId: 1,
          toChainId: 1,
          fromToken: { address: '0x1', symbol: 'A', decimals: 18 },
          toToken: { address: '0x2', symbol: 'B', decimals: 18 },
          fromAmount: '100',
        },
        estimate: { fromAmount: '100', toAmount: '99', toAmountMin: '98' },
        transactionRequest: {
          to: '0xdef',
          data: '0xcalldata',
          value: '0x0',
          gasLimit: '0x493e0', // 300000 decimal
        },
      };

      vi.mocked(lifiSdk.getContractCallsQuote).mockResolvedValue(
        mockQuote as unknown as never,
      );

      const result = await adapter.getContractCallQuote(params);

      expect(lifiSdk.getContractCallsQuote).toHaveBeenCalledWith(
        expect.objectContaining({
          fromChain: 1,
          contractCalls: params.contractCalls,
        }),
      );

      expect(result.transaction.to).toBe('0xdef');
      expect(result.transaction.data).toBe('0xcalldata');
      expect(result.transaction.meta?.intentType).toBe('SUPPLY');
    });

    it('should throw QuoteError when API fails', async () => {
      vi.mocked(lifiSdk.getContractCallsQuote).mockRejectedValue(
        new Error('API Error'),
      );

      await expect(adapter.getContractCallQuote(params)).rejects.toThrow(
        QuoteError,
      );
      await expect(adapter.getContractCallQuote(params)).rejects.toThrow(
        'Failed to get contract call quote from LI.FI',
      );
    });
  });
});
