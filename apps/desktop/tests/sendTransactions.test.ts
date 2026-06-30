import { describe, expect, it } from 'vitest';

import {
  buildSendTransactionRequest,
  defaultSendChain,
  encodeErc20TransferData,
  parseTokenAmountToBaseUnits,
} from '../src/integration/sendTransactions';
import type { DesktopWalletAsset } from '../src/integration/walletTokens';

const RECIPIENT = '0x1111111111111111111111111111111111111111';

const usdcAsset: DesktopWalletAsset = {
  amountLabel: '42.5 USDC',
  chains: ['ethereum', 'base'],
  glyph: '$',
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
  iconBg: '#2775ca',
  name: 'USD Coin',
  rawAmount: 42.5,
  symbol: 'USDC',
  usdPrice: 1,
  usdValue: 42.5,
};

const ethAsset: DesktopWalletAsset = {
  amountLabel: '0.5 ETH',
  chains: ['base'],
  glyph: 'Ξ',
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
  iconBg: '#2a2a30',
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
  });

  it('prefers Base when a token exists on multiple chains', () => {
    expect(defaultSendChain(usdcAsset)).toBe('base');
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
      data: encodeErc20TransferData(RECIPIENT, 12340000n),
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
