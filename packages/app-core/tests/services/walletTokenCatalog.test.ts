import {
  SUPPORTED_WALLET_TOKEN_ADDRESSES_BY_CHAIN,
  SUPPORTED_WALLET_TOKEN_DEFINITIONS,
} from '@core/services/walletTokenCatalog';
import { describe, expect, it } from 'vitest';

describe('wallet token catalog', () => {
  it('keeps lower-case address views byte-identical', () => {
    expect(SUPPORTED_WALLET_TOKEN_ADDRESSES_BY_CHAIN).toEqual({
      eth: {
        USDC: ['0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'],
        USDT: ['0xdac17f958d2ee523a2206206994597c13d831ec7'],
        WETH: ['0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'],
        WBTC: ['0x2260fac5e5542a773aa44fbcfedf7c193bc2c599'],
        CBBTC: ['0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf'],
      },
      base: {
        USDC: ['0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'],
        WETH: ['0x4200000000000000000000000000000000000006'],
        CBBTC: ['0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf'],
      },
      arbitrum: {
        USDC: ['0xaf88d065e77c8cc2239327c5edb3a432268e5831'],
        USDT: ['0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9'],
        WETH: ['0x82af49447d8a07e3bd95bd0d56f35241523fbab1'],
        WBTC: ['0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f'],
        CBBTC: ['0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf'],
      },
    });
  });

  it('keeps metadata-derived definitions byte-identical', () => {
    expect(SUPPORTED_WALLET_TOKEN_DEFINITIONS.WBTC).toMatchObject({
      symbol: 'WBTC',
      name: 'Wrapped Bitcoin',
      decimals: 8,
    });
    expect(SUPPORTED_WALLET_TOKEN_DEFINITIONS.ETH).toMatchObject({
      symbol: 'ETH',
      name: 'Ethereum',
      decimals: 18,
      addresses: {},
    });
  });
});
