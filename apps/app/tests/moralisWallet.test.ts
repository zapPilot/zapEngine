import { describe, expect, it } from 'vitest';

import {
  buildActivityGroupsFromMoralisHistory,
  buildChainTokenBalanceRows,
  buildDesktopWalletAssets,
  buildInvestableBalanceRows,
  type MoralisChainKey,
  type MoralisWalletHistoryResponse,
  type MoralisWalletTokenBalancesResponse,
  normalizeWalletAddressList,
} from '@/integration/moralisWallet';

function balances(
  chain: MoralisChainKey,
  result: MoralisWalletTokenBalancesResponse['result'],
) {
  return { chain, response: { result } };
}

function history(
  chain: MoralisChainKey,
  result: MoralisWalletHistoryResponse['result'],
) {
  return { chain, response: { result } };
}

describe('Moralis desktop wallet mapping', () => {
  it('normalizes wallet address inputs before query fan-out', () => {
    expect(
      normalizeWalletAddressList([
        ' 0xABCDEF0000000000000000000000000000000001 ',
        '0xabcdef0000000000000000000000000000000001',
        '',
        null,
        undefined,
        '0x2222222222222222222222222222222222222222',
      ]),
    ).toEqual([
      '0xabcdef0000000000000000000000000000000001',
      '0x2222222222222222222222222222222222222222',
    ]);

    expect(normalizeWalletAddressList(' 0xABC ')).toEqual(['0xabc']);
    expect(normalizeWalletAddressList([null, undefined, '   '])).toEqual([]);
  });

  it('groups supported holdings across Ethereum, Base, and Arbitrum only', () => {
    const assets = buildDesktopWalletAssets([
      balances('eth', [
        {
          symbol: 'ETH',
          name: 'Ethereum',
          native_token: true,
          balance_formatted: '1.5',
          usd_value: 4500,
        },
        {
          symbol: 'WBTC',
          name: 'Wrapped Bitcoin',
          token_address: '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599',
          balance_formatted: '0.01',
          usd_value: 1000,
        },
        {
          symbol: 'LINK',
          name: 'Chainlink',
          balance_formatted: '10',
          usd_value: 150,
        },
      ]),
      balances('base', [
        {
          symbol: 'USDC',
          name: 'USD Coin',
          token_address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
          balance_formatted: '250',
          usd_value: 250,
        },
        {
          symbol: 'cbBTC',
          name: 'Coinbase Wrapped BTC',
          token_address: '0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf',
          balance_formatted: '0.02',
          usd_value: 2000,
        },
      ]),
      balances('arbitrum', [
        {
          symbol: 'WBTC',
          name: 'Wrapped Bitcoin',
          token_address: '0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f',
          balance_formatted: '0.005',
          usd_value: 500,
        },
      ]),
    ]);

    expect(assets.map((asset) => asset.symbol)).toEqual([
      'ETH',
      'CBBTC',
      'WBTC',
      'USDC',
    ]);
    expect(assets.find((asset) => asset.symbol === 'WBTC')).toMatchObject({
      name: 'Wrapped Bitcoin',
      usdValue: 1500,
      amountLabel: '0.015 WBTC',
      chains: ['ethereum', 'arbitrum'],
      holdings: [
        {
          chain: 'ethereum',
          chainId: 1,
          decimals: 8,
          rawAmount: 0.01,
          tokenAddress: '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599',
          usdValue: 1000,
        },
        {
          chain: 'arbitrum',
          chainId: 42161,
          decimals: 8,
          rawAmount: 0.005,
          tokenAddress: '0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f',
          usdValue: 500,
        },
      ],
    });
    expect(assets.map((asset) => asset.symbol)).not.toContain('LINK');
  });

  it('uses the same grouped assets for the invest balance rows', () => {
    const assets = buildDesktopWalletAssets([
      balances('base', [
        {
          symbol: 'USDC',
          name: 'USD Coin',
          token_address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
          balance_formatted: '100',
          usd_value: 100,
        },
        {
          symbol: 'WETH',
          name: 'Wrapped Ether',
          token_address: '0x4200000000000000000000000000000000000006',
          balance_formatted: '2',
          usd_value: 6000,
        },
      ]),
    ]);

    const rows = buildInvestableBalanceRows(assets);

    expect(rows).toEqual([
      expect.objectContaining({
        token: expect.objectContaining({ symbol: 'WETH' }),
        amountLabel: '2 WETH',
        usdValue: 6000,
        isDepositSupported: false,
      }),
      expect.objectContaining({
        token: expect.objectContaining({ symbol: 'USDC' }),
        amountLabel: '100 USDC',
        usdValue: 100,
        isDepositSupported: true,
      }),
    ]);
  });

  it('flattens exact chain-token holdings without cross-chain aggregation', () => {
    const rows = buildChainTokenBalanceRows(
      buildDesktopWalletAssets([
        balances('base', [
          {
            symbol: 'USDC',
            name: 'USD Coin',
            token_address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
            balance_formatted: '12.345678',
            usd_value: 12.345678,
          },
        ]),
        balances('arbitrum', [
          {
            symbol: 'USDC',
            name: 'USD Coin',
            token_address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
            balance_formatted: '7.000001',
            usd_value: 7.000001,
          },
        ]),
      ]),
    );

    expect(
      rows.map(({ id, balanceBaseUnits }) => ({ id, balanceBaseUnits })),
    ).toEqual([
      { id: '8453:USDC', balanceBaseUnits: '12345678' },
      { id: '42161:USDC', balanceBaseUnits: '7000001' },
    ]);
  });

  it('filters spoofed same-symbol token addresses and non-native ETH rows', () => {
    const assets = buildDesktopWalletAssets([
      balances('base', [
        {
          symbol: 'USDC',
          name: 'Fake USD Coin',
          token_address: '0x0000000000000000000000000000000000000001',
          balance_formatted: '999999',
          usd_value: 999999,
        },
        {
          symbol: 'USDC',
          name: 'USD Coin',
          token_address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
          balance_formatted: '25',
          usd_value: 25,
        },
        {
          symbol: 'ETH',
          name: 'Fake ETH',
          token_address: '0x0000000000000000000000000000000000000002',
          native_token: false,
          balance_formatted: '10',
          usd_value: 30000,
        },
        {
          symbol: 'ETH',
          name: 'Ethereum',
          native_token: true,
          balance_formatted: '1',
          usd_value: 3000,
        },
      ]),
    ]);

    expect(assets).toEqual([
      expect.objectContaining({
        symbol: 'ETH',
        rawAmount: 1,
        usdValue: 3000,
      }),
      expect.objectContaining({
        symbol: 'USDC',
        rawAmount: 25,
        usdValue: 25,
      }),
    ]);
  });

  it('maps the first page of wallet history into top-ten activity groups', () => {
    const groups = buildActivityGroupsFromMoralisHistory(
      [
        history('base', [
          {
            hash: '0xnewer',
            block_timestamp: '2026-06-28T02:00:00.000Z',
            summary: 'Received 50 USDC',
            category: 'token receive',
            receipt_status: '1',
            erc20_transfers: [
              {
                token_symbol: 'USDC',
                token_address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
                direction: 'receive',
                value_formatted: '50',
                value_usd: '50',
              },
            ],
          },
        ]),
        history('arbitrum', [
          {
            hash: '0xolder',
            block_timestamp: '2026-06-25T02:00:00.000Z',
            summary: 'Sent 0.01 ETH',
            category: 'send',
            receipt_status: '1',
            native_transfers: [
              {
                token_symbol: 'ETH',
                direction: 'send',
                value_formatted: '0.01',
                value_usd: '30',
              },
            ],
          },
        ]),
      ],
      {
        limit: 10,
        nowMs: Date.parse('2026-06-28T03:00:00.000Z'),
        timeZone: 'UTC',
      },
    );

    expect(groups).toEqual([
      {
        label: 'Today',
        events: [
          expect.objectContaining({
            id: 'base-0xnewer',
            kind: 'deposit',
            title: 'Received 50 USDC',
            amountLabel: '+$50.00',
            status: 'Completed',
            meta: 'USDC · Base',
            time: '02:00',
          }),
        ],
      },
      {
        label: 'This week',
        events: [
          expect.objectContaining({
            id: 'arbitrum-0xolder',
            kind: 'withdraw',
            title: 'Sent 0.01 ETH',
            amountLabel: '−$30.00',
            meta: 'ETH · Arbitrum',
            time: 'Thu',
          }),
        ],
      },
    ]);
  });

  it('marks only explicit non-success receipt statuses as failed', () => {
    const groups = buildActivityGroupsFromMoralisHistory(
      [
        history('base', [
          {
            hash: '0xfailed',
            block_timestamp: '2026-06-28T02:00:00.000Z',
            summary: 'Received 10 USDC',
            category: 'token receive',
            receipt_status: '0',
            erc20_transfers: [
              {
                token_symbol: 'USDC',
                token_address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
                direction: 'receive',
                value_usd: '10',
              },
            ],
          },
          {
            hash: '0xunknown',
            block_timestamp: '2026-06-28T01:00:00.000Z',
            summary: 'Received 5 USDC',
            category: 'token receive',
            receipt_status: null,
            erc20_transfers: [
              {
                token_symbol: 'USDC',
                token_address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
                direction: 'receive',
                value_usd: '5',
              },
            ],
          },
        ]),
      ],
      {
        limit: 10,
        nowMs: Date.parse('2026-06-28T03:00:00.000Z'),
        timeZone: 'UTC',
      },
    );

    expect(groups[0]?.events.map((event) => event.status)).toEqual([
      'Failed',
      'Completed',
    ]);
  });
});
