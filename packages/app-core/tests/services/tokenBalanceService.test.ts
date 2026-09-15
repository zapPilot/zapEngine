import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getBalance: vi.fn(),
  readContract: vi.fn(),
  getTokenPrice: vi.fn(),
  getPublicClient: vi.fn(),
}));

vi.mock('@core/services/intentClient', () => ({
  getPublicClient: (...args: unknown[]) => mocks.getPublicClient(...args),
  intentEngine: {
    getTokenPrice: (...args: unknown[]) => mocks.getTokenPrice(...args),
  },
}));

import {
  getOnChainTokenBalance,
  NATIVE_TOKEN_ADDRESS,
} from '@core/services/tokenBalanceService';

describe('tokenBalanceService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPublicClient.mockReturnValue({
      getBalance: mocks.getBalance,
      readContract: mocks.readContract,
    });
    mocks.getTokenPrice.mockResolvedValue({ priceUSD: '2' });
  });

  it('reads native balances and applies a finite USD price', async () => {
    mocks.getBalance.mockResolvedValue(1_500_000_000_000_000_000n);

    await expect(
      getOnChainTokenBalance(
        8453,
        NATIVE_TOKEN_ADDRESS,
        18,
        '0x1111111111111111111111111111111111111111',
      ),
    ).resolves.toEqual({ balance: '1.5', usdValue: 3 });

    expect(mocks.getBalance).toHaveBeenCalledWith({
      address: '0x1111111111111111111111111111111111111111',
    });
    expect(mocks.readContract).not.toHaveBeenCalled();
  });

  it('reads ERC20 balances through balanceOf', async () => {
    mocks.readContract.mockResolvedValue(2_500_000n);
    const token = '0x2222222222222222222222222222222222222222';

    await expect(
      getOnChainTokenBalance(
        8453,
        token,
        6,
        '0x1111111111111111111111111111111111111111',
      ),
    ).resolves.toEqual({ balance: '2.5', usdValue: 5 });

    expect(mocks.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: token,
        functionName: 'balanceOf',
        args: ['0x1111111111111111111111111111111111111111'],
      }),
    );
  });

  it('falls back to zero valuation for missing, invalid, or rejected pricing', async () => {
    mocks.getBalance.mockResolvedValue(1_000_000_000_000_000_000n);

    mocks.getTokenPrice.mockResolvedValueOnce({});
    await expect(
      getOnChainTokenBalance(
        1,
        NATIVE_TOKEN_ADDRESS,
        18,
        '0x1111111111111111111111111111111111111111',
      ),
    ).resolves.toEqual({ balance: '1', usdValue: 0 });

    mocks.getTokenPrice.mockResolvedValueOnce({ priceUSD: 'not-a-number' });
    await expect(
      getOnChainTokenBalance(
        1,
        NATIVE_TOKEN_ADDRESS,
        18,
        '0x1111111111111111111111111111111111111111',
      ),
    ).resolves.toEqual({ balance: '1', usdValue: 0 });

    mocks.getTokenPrice.mockRejectedValueOnce(new Error('pricing unavailable'));
    await expect(
      getOnChainTokenBalance(
        1,
        NATIVE_TOKEN_ADDRESS,
        18,
        '0x1111111111111111111111111111111111111111',
      ),
    ).resolves.toEqual({ balance: '1', usdValue: 0 });
  });
});
