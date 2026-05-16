import { erc20Abi } from 'viem';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getOnChainTokenBalance,
  NATIVE_TOKEN_ADDRESS,
} from '@/services/tokenBalanceService';

const {
  mockGetBalance,
  mockGetPublicClient,
  mockGetTokenPrice,
  mockReadContract,
} = vi.hoisted(() => ({
  mockGetBalance: vi.fn(),
  mockGetPublicClient: vi.fn(),
  mockGetTokenPrice: vi.fn(),
  mockReadContract: vi.fn(),
}));

vi.mock('@/services/intentClient', () => ({
  getPublicClient: mockGetPublicClient,
  intentEngine: {
    getTokenPrice: mockGetTokenPrice,
  },
}));

describe('tokenBalanceService', () => {
  const accountAddress = '0x1234567890abcdef1234567890abcdef12345678';

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPublicClient.mockReturnValue({
      getBalance: mockGetBalance,
      readContract: mockReadContract,
    });
    mockGetTokenPrice.mockResolvedValue({
      address: NATIVE_TOKEN_ADDRESS,
      symbol: 'ETH',
      decimals: 18,
      priceUSD: '3200.50',
    });
  });

  it('reads native ETH balance and values it with LI.FI token price', async () => {
    mockGetBalance.mockResolvedValueOnce(1500000000000000000n);

    const result = await getOnChainTokenBalance(
      8453,
      NATIVE_TOKEN_ADDRESS,
      18,
      accountAddress,
    );

    expect(mockGetPublicClient).toHaveBeenCalledWith(8453);
    expect(mockGetBalance).toHaveBeenCalledWith({ address: accountAddress });
    expect(mockReadContract).not.toHaveBeenCalled();
    expect(mockGetTokenPrice).toHaveBeenCalledWith(8453, NATIVE_TOKEN_ADDRESS);
    expect(result).toEqual({
      balance: '1.5',
      usdValue: 4800.75,
    });
  });

  it('reads ERC-20 balanceOf and values it with LI.FI token price', async () => {
    const usdcAddress = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
    mockReadContract.mockResolvedValueOnce(123456789n);
    mockGetTokenPrice.mockResolvedValueOnce({
      address: usdcAddress,
      symbol: 'USDC',
      decimals: 6,
      priceUSD: '1.01',
    });

    const result = await getOnChainTokenBalance(
      8453,
      usdcAddress,
      6,
      accountAddress,
    );

    expect(mockGetBalance).not.toHaveBeenCalled();
    expect(mockReadContract).toHaveBeenCalledWith({
      address: usdcAddress,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [accountAddress],
    });
    expect(mockGetTokenPrice).toHaveBeenCalledWith(8453, usdcAddress);
    expect(result.balance).toBe('123.456789');
    expect(result.usdValue).toBeCloseTo(124.69135689);
  });

  it('returns the on-chain balance with zero USD value when price lookup fails', async () => {
    mockReadContract.mockResolvedValueOnce(42000000n);
    mockGetTokenPrice.mockRejectedValueOnce(new Error('LI.FI unavailable'));

    const result = await getOnChainTokenBalance(
      8453,
      '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      6,
      accountAddress,
    );

    expect(result).toEqual({
      balance: '42',
      usdValue: 0,
    });
  });
});
