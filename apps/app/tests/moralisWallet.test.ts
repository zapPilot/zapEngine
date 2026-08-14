import { describe, expect, it } from 'vitest';

import {
  buildActivityGroupsFromMoralisHistory,
  buildChainTokenBalanceRows,
  buildDesktopWalletAssets,
  buildInvestableBalanceRows,
  type MoralisChainKey,
  type MoralisWalletHistoryResponse,
  type WalletTokenBalancesResponse,
  normalizeWalletAddressList,
} from '@/integration/moralisWallet';
import { DEFAULT_ARBITRUM_FUNDING_TOKEN } from '@/integration/depositTokens';
import { balanceForFundingToken } from '@/integration/investAmountModel';

function balances(
  chain: MoralisChainKey,
  result: WalletTokenBalancesResponse['result'],
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

  it('preserves canonical Arbitrum USDC for the invest funding lookup', () => {
    const rows = buildChainTokenBalanceRows(
      buildDesktopWalletAssets([
        balances('arbitrum', [
          {
            symbol: 'USDC',
            name: 'USD Coin',
            token_address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
            balance_formatted: '40.767807',
            usd_value: 40.767807,
          },
          {
            symbol: 'USDC',
            name: 'Bridged USD Coin',
            token_address: '0xff970a61a04b1ca14834a43f5de4533ebddb5cc8',
            balance_formatted: '999',
            usd_value: 999,
          },
        ]),
      ]),
    );

    expect(rows).toHaveLength(1);
    expect(
      balanceForFundingToken(rows, DEFAULT_ARBITRUM_FUNDING_TOKEN),
    ).toEqual(
      expect.objectContaining({
        chainId: 42161,
        tokenAddress: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
        balance: '40.767807',
        balanceBaseUnits: '40767807',
        usdValue: 40.767807,
        usdPrice: 1,
        token: expect.objectContaining({ symbol: 'USDC' }),
      }),
    );
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

  it('maps wallet history into net-delta groups with a category summary', () => {
    const { groups, summary } = buildActivityGroupsFromMoralisHistory(
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
                address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
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
            amountTone: 'positive',
            status: 'Completed',
            meta: 'Base',
            time: '1h',
            category: 'stable',
            chain: 'base',
            tokenSymbol: 'USDC',
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
            amountTone: 'negative',
            meta: 'Arbitrum',
            time: '3d',
            category: 'eth',
            chain: 'arbitrum',
          }),
        ],
      },
    ]);

    expect(summary).toEqual([
      expect.objectContaining({ category: 'stable', usdNet: 50, share: 0.5 }),
      expect.objectContaining({ category: 'eth', usdNet: -30, share: 0.5 }),
    ]);
  });

  it('dedupes transactions surfaced once per involved bundle wallet', () => {
    const event = {
      hash: '0xshared',
      block_timestamp: '2026-06-28T02:00:00.000Z',
      receipt_status: '1',
      erc20_transfers: [
        {
          token_symbol: 'USDC',
          address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
          direction: 'receive',
          value_formatted: '50',
        },
      ],
    };

    const { groups } = buildActivityGroupsFromMoralisHistory(
      [history('base', [event]), history('base', [event])],
      {
        limit: 10,
        nowMs: Date.parse('2026-06-28T03:00:00.000Z'),
        timeZone: 'UTC',
      },
    );

    expect(groups).toHaveLength(1);
    expect(groups[0]?.events).toHaveLength(1);
  });

  it('maps before dedupe so a later valid wallet perspective is retained', () => {
    const invalidPerspective = {
      hash: '0xshared',
      block_timestamp: '2026-06-28T02:00:00.000Z',
      receipt_status: '1',
      erc20_transfers: [
        {
          token_symbol: 'USDC',
          address: '0x0000000000000000000000000000000000000001',
          direction: 'receive',
          value_formatted: '50',
        },
      ],
    };
    const validPerspective = {
      ...invalidPerspective,
      erc20_transfers: [
        {
          token_symbol: 'USDC',
          address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
          direction: 'receive',
          value_formatted: '50',
        },
      ],
    };

    const { groups } = buildActivityGroupsFromMoralisHistory(
      [
        history('base', [invalidPerspective]),
        history('base', [validPerspective]),
      ],
      {
        limit: 10,
        nowMs: Date.parse('2026-06-28T03:00:00.000Z'),
      },
    );

    expect(groups[0]?.events).toEqual([
      expect.objectContaining({ id: 'base-0xshared', category: 'stable' }),
    ]);
  });

  it('keeps the same hash when it appears on different chains', () => {
    const shared = {
      hash: '0xshared',
      block_timestamp: '2026-06-28T02:00:00.000Z',
      receipt_status: '1',
    };
    const { groups } = buildActivityGroupsFromMoralisHistory(
      [
        history('base', [
          {
            ...shared,
            erc20_transfers: [
              {
                token_symbol: 'USDC',
                address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
                direction: 'receive',
                value_formatted: '50',
              },
            ],
          },
        ]),
        history('arbitrum', [
          {
            ...shared,
            native_transfers: [
              {
                direction: 'receive',
                value_formatted: '0.01',
              },
            ],
          },
        ]),
      ],
      {
        limit: 10,
        nowMs: Date.parse('2026-06-28T03:00:00.000Z'),
      },
    );

    expect(groups[0]?.events.map((event) => event.id)).toEqual([
      'base-0xshared',
      'arbitrum-0xshared',
    ]);
  });

  it('collapses same-chain bursts into one logical event', () => {
    const burstEvent = (hash: string, minute: number) => ({
      hash,
      block_timestamp: `2026-06-28T02:0${minute}:00.000Z`,
      receipt_status: '1',
      erc20_transfers: [
        {
          token_symbol: 'USDC',
          address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
          direction: 'send',
          value_formatted: '100',
        },
        {
          token_symbol: 'CBBTC',
          address: '0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf',
          direction: 'receive',
          value_formatted: '0.001',
        },
      ],
    });

    const { groups } = buildActivityGroupsFromMoralisHistory(
      [
        history('base', [
          burstEvent('0xa', 3),
          burstEvent('0xb', 2),
          burstEvent('0xc', 1),
        ]),
      ],
      {
        limit: 10,
        nowMs: Date.parse('2026-06-28T03:00:00.000Z'),
        timeZone: 'UTC',
      },
    );

    expect(groups).toHaveLength(1);
    expect(groups[0]?.events).toEqual([
      expect.objectContaining({
        id: 'base-burst-0xa',
        kind: 'rebalance',
        title: 'Rebalanced portfolio',
        txCount: 3,
        meta: 'Base · 3 transactions',
        status: 'Completed',
        category: 'btc',
        tokenSymbol: 'CBBTC',
      }),
    ]);
  });

  it('marks only explicit non-success receipt statuses as failed', () => {
    const { groups } = buildActivityGroupsFromMoralisHistory(
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
                address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
                direction: 'receive',
                value_formatted: '10',
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
                address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
                direction: 'receive',
                value_formatted: '5',
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
