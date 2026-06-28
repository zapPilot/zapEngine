import { describe, expect, it } from 'vitest';

import { type DemoAsset } from '../src/data/demo';
import {
  buildActivityGroupsFromMoralisHistory,
  buildDesktopWalletAssets,
  buildInvestableBalanceRows,
  type MoralisChainKey,
  type MoralisWalletHistoryResponse,
  type MoralisWalletTokenBalancesResponse,
} from '../src/integration/moralisWallet';

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
    });
    expect(
      (assets as DemoAsset[]).some((asset) => asset.symbol === 'LINK'),
    ).toBe(false);
  });

  it('uses the same grouped assets for the invest balance rows', () => {
    const assets = buildDesktopWalletAssets([
      balances('base', [
        {
          symbol: 'USDC',
          name: 'USD Coin',
          balance_formatted: '100',
          usd_value: 100,
        },
        {
          symbol: 'WETH',
          name: 'Wrapped Ether',
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
});
