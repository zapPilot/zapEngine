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

const fromToken = '0x0000000000000000000000000000000000000001' as const;
const toToken = '0x0000000000000000000000000000000000000002' as const;
const fromAddress = '0x000000000000000000000000000000000000abcd' as const;
const contractAddress = '0x00000000000000000000000000000000000000aa' as const;

const contractCalls = [
  {
    fromAmount: '1000000',
    fromTokenAddress: fromToken,
    toContractAddress: contractAddress,
    toContractCallData: '0x1234' as const,
    toContractGasLimit: '100000',
  },
];

function mockContractQuote(): void {
  vi.mocked(lifiSdk.getContractCallsQuote).mockResolvedValueOnce({
    id: 'quote-contract-call',
    type: 'lifi',
    tool: 'composer',
    action: {
      fromChainId: 8453,
      toChainId: 8453,
      fromToken: { address: fromToken, symbol: 'USDC', decimals: 6 },
      toToken: { address: toToken, symbol: 'vaultUSDC', decimals: 6 },
      fromAmount: '1000000',
    },
    estimate: {
      fromAmount: '1000000',
      toAmount: '990000',
      toAmountMin: '990000',
    },
    transactionRequest: {
      to: contractAddress,
      data: '0xdeadbeef',
      value: '0x0',
    },
  } as unknown as never);
}

function contractRequest() {
  return vi.mocked(lifiSdk.getContractCallsQuote).mock.calls[0]?.[0];
}

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

  it('forwards toAmount for exact-output contract calls', async () => {
    mockContractQuote();

    await adapter.getContractCallQuote({
      fromChain: 8453,
      toChain: 8453,
      fromToken,
      toToken,
      toAmount: '990000',
      fromAddress,
      contractCalls,
    });

    expect(lifiSdk.getContractCallsQuote).toHaveBeenCalledWith({
      fromChain: 8453,
      toChain: 8453,
      fromToken,
      toToken,
      fromAddress,
      contractCalls,
      toAmount: '990000',
    });
    expect(contractRequest()).not.toHaveProperty('fromAmount');
  });

  it('forwards fromAmount for exact-input contract calls', async () => {
    mockContractQuote();

    await adapter.getContractCallQuote({
      fromChain: 8453,
      toChain: 8453,
      fromToken,
      toToken,
      fromAmount: '1000000',
      fromAddress,
      contractCalls,
    });

    expect(lifiSdk.getContractCallsQuote).toHaveBeenCalledWith({
      fromChain: 8453,
      toChain: 8453,
      fromToken,
      toToken,
      fromAddress,
      contractCalls,
      fromAmount: '1000000',
    });
    expect(contractRequest()).not.toHaveProperty('toAmount');
  });

  it('wraps getToken failures and preserves the cause', async () => {
    const cause = new Error('LI.FI getToken failed');
    vi.mocked(lifiSdk.getToken).mockRejectedValueOnce(cause);

    let caught: unknown;
    try {
      await adapter.getTokenPrice(8453, fromToken);
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
    expect(lifiSdk.getToken).toHaveBeenCalledWith(8453, fromToken);
  });
});
