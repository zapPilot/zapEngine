import { describe, expect, it } from 'vitest';

import {
  buildSendTransactionRequest,
  defaultSendChain,
  holdingForChain,
  parseTokenAmountToBaseUnits,
} from '@/integration/sendTransactions';
import type { DesktopWalletAsset } from '@/integration/walletTokens';

const RECIPIENT = '0x1111111111111111111111111111111111111111';

const usdcAsset: DesktopWalletAsset = {
  amountLabel: '42.5 USDC',
  chains: ['ethereum', 'base'],
  holdings: [
    {
      chain: 'ethereum',
      chainId: 1,
      decimals: 6,
      rawAmount: 12.5,
      tokenAddress: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      usdValue: 12.5,
    },
    {
      chain: 'base',
      chainId: 8453,
      decimals: 6,
      rawAmount: 30,
      tokenAddress: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
      usdValue: 30,
    },
  ],
  name: 'USD Coin',
  rawAmount: 42.5,
  symbol: 'USDC',
  usdPrice: 1,
  usdValue: 42.5,
};

const ethAsset: DesktopWalletAsset = {
  amountLabel: '0.5 ETH',
  chains: ['base'],
  holdings: [
    {
      chain: 'base',
      chainId: 8453,
      decimals: 18,
      rawAmount: 0.5,
      tokenAddress: null,
      usdValue: 1500,
    },
  ],
  name: 'Ethereum',
  rawAmount: 0.5,
  symbol: 'ETH',
  usdPrice: 3000,
  usdValue: 1500,
};

describe('send transaction helpers', () => {
  it('parses decimal token amounts into base units without float math', () => {
    expect(parseTokenAmountToBaseUnits('1,234.56', 6)).toBe(1234560000n);
    expect(parseTokenAmountToBaseUnits('0.000001', 6)).toBe(1n);
    expect(parseTokenAmountToBaseUnits('0.0000001', 6)).toBeNull();
    expect(parseTokenAmountToBaseUnits('1e6', 6)).toBeNull();
    expect(parseTokenAmountToBaseUnits(' 1,000. ', 0)).toBe(1000n);
    expect(parseTokenAmountToBaseUnits('.5', 6)).toBeNull();
    expect(parseTokenAmountToBaseUnits('-1', 6)).toBeNull();
  });

  it('finds holdings by chain and returns null when none are available', () => {
    expect(holdingForChain(usdcAsset, 'ethereum')).toBe(usdcAsset.holdings[0]);
    expect(holdingForChain(usdcAsset, 'arbitrum')).toBeNull();
    expect(holdingForChain(null, 'base')).toBeNull();
    expect(holdingForChain(undefined, 'base')).toBeNull();
  });

  it('chooses Base, Ethereum, the first holding, then Base as defaults', () => {
    expect(defaultSendChain(usdcAsset)).toBe('base');
    expect(
      defaultSendChain({
        ...usdcAsset,
        chains: ['ethereum'],
        holdings: [usdcAsset.holdings[0]!],
      }),
    ).toBe('ethereum');
    expect(
      defaultSendChain({
        ...usdcAsset,
        chains: ['arbitrum'],
        holdings: [{ ...usdcAsset.holdings[0]!, chain: 'arbitrum' }],
      }),
    ).toBe('arbitrum');
    expect(defaultSendChain({ ...usdcAsset, chains: [], holdings: [] })).toBe(
      'base',
    );
  });

  it('builds an ERC-20 transfer request for the selected chain', () => {
    const request = buildSendTransactionRequest({
      amount: '12.34',
      asset: usdcAsset,
      holding: usdcAsset.holdings[1]!,
      recipient: RECIPIENT,
    });

    expect(request).toEqual({
      chainId: 8453,
      to: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
      data: '0xa9059cbb00000000000000000000000011111111111111111111111111111111111111110000000000000000000000000000000000000000000000000000000000bc4b20',
    });
  });

  it('builds a native ETH value transfer request', () => {
    expect(
      buildSendTransactionRequest({
        amount: '0.01',
        asset: ethAsset,
        holding: ethAsset.holdings[0]!,
        recipient: RECIPIENT,
      }),
    ).toEqual({
      chainId: 8453,
      to: RECIPIENT,
      value: 10000000000000000n,
    });
  });

  it('rejects invalid and zero-value sends', () => {
    expect(parseTokenAmountToBaseUnits('0', 6)).toBe(0n);

    for (const amount of ['invalid', '0']) {
      expect(() =>
        buildSendTransactionRequest({
          amount,
          asset: usdcAsset,
          holding: usdcAsset.holdings[1]!,
          recipient: RECIPIENT,
        }),
      ).toThrow('Enter a valid amount.');
    }
  });

  it('builds an ERC-20 transfer when an ETH-labelled asset has a token address', () => {
    const wrappedEth = {
      ...ethAsset,
      holdings: [
        {
          ...ethAsset.holdings[0]!,
          tokenAddress: '0x4200000000000000000000000000000000000006' as const,
        },
      ],
    };

    expect(
      buildSendTransactionRequest({
        amount: '1',
        asset: wrappedEth,
        holding: wrappedEth.holdings[0],
        recipient: `  ${RECIPIENT}  `,
      }),
    ).toMatchObject({
      chainId: 8453,
      to: '0x4200000000000000000000000000000000000006',
    });
  });

  it('rejects a non-ETH holding with no token address instead of treating it as native', () => {
    const unsupportedAsset: DesktopWalletAsset = {
      ...usdcAsset,
      chains: ['base'],
      holdings: [{ ...usdcAsset.holdings[1]!, tokenAddress: null }],
    };

    expect(() =>
      buildSendTransactionRequest({
        amount: '1',
        asset: unsupportedAsset,
        holding: unsupportedAsset.holdings[0]!,
        recipient: RECIPIENT,
      }),
    ).toThrow('USDC cannot be sent on base.');
  });

  it('rejects invalid recipient addresses', () => {
    expect(() =>
      buildSendTransactionRequest({
        amount: '1',
        asset: usdcAsset,
        holding: usdcAsset.holdings[0]!,
        recipient: '0xnope',
      }),
    ).toThrow('valid recipient');
  });
});
