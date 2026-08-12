import {
  CANONICAL_TOKEN_ADDRESSES,
  NATIVE_TOKEN_ADDRESS,
  TOKEN_METADATA,
} from '../../../src/shared/tokens';
import {
  BASE_USDC_ADDRESS,
  DEPOSIT_USDC_ADDRESSES,
  DEPOSIT_USDT_ADDRESSES,
} from '../../../src/api/deposit';
import { describe, expect, it } from 'vitest';

describe('canonical token registry', () => {
  it('preserves token metadata', () => {
    expect(TOKEN_METADATA).toEqual({
      USDC: { name: 'USD Coin', decimals: 6 },
      USDT: { name: 'Tether USD', decimals: 6 },
      ETH: { name: 'Ethereum', decimals: 18 },
      WETH: { name: 'Wrapped Ether', decimals: 18 },
      WBTC: { name: 'Wrapped Bitcoin', decimals: 8 },
      CBBTC: { name: 'Coinbase Wrapped BTC', decimals: 8 },
    });
  });

  it('preserves case-sensitive addresses', () => {
    expect(NATIVE_TOKEN_ADDRESS).toBe(
      '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
    );
    expect(CANONICAL_TOKEN_ADDRESSES).toEqual({
      1: {
        USDC: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
        USDT: '0xdac17f958d2ee523a2206206994597c13d831ec7',
        WETH: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
        WBTC: '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599',
        CBBTC: '0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf',
      },
      8453: {
        USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        WETH: '0x4200000000000000000000000000000000000006',
        CBBTC: '0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf',
      },
      42161: {
        USDC: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
        USDT: '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9',
        WETH: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
        WBTC: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f',
        CBBTC: '0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf',
      },
    });
  });

  it('keeps deposit address views byte-identical', () => {
    expect(BASE_USDC_ADDRESS).toBe(
      '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    );
    expect(DEPOSIT_USDC_ADDRESSES).toEqual({
      1: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      8453: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      42161: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    });
    expect(DEPOSIT_USDT_ADDRESSES).toEqual({
      1: '0xdac17f958d2ee523a2206206994597c13d831ec7',
      42161: '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9',
    });
  });
});
