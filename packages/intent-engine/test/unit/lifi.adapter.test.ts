import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LiFiAdapter } from '../../src/adapters/lifi.adapter.js';
import { QuoteError } from '../../src/errors/intent.errors.js';
import * as lifiSdk from '@lifi/sdk';

// Mock the @lifi/sdk
vi.mock('@lifi/sdk', () => {
  return {
    createConfig: vi.fn(),
    getQuote: vi.fn(),
    getContractCallsQuote: vi.fn(),
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
          value: '0',
          gasLimit: '100000',
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
          value: '10',
          gasLimit: '200000',
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
        'Failed to get swap quote from LI.FI',
      );
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
          value: '0',
          gasLimit: '300000',
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
