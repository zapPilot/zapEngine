import { describe, expect, it } from 'vitest';

import type { WalletTokenChain } from '@zapengine/app-core/services/walletTokenCatalog';

import {
  buildChainTokenBalanceRows,
  buildDesktopWalletAssets,
  buildWalletAssetsResult,
  type DesktopWalletAsset,
  type WalletTokenBalancesResponse,
  normalizeWalletAddressList,
} from '@/integration/walletAssetModel';
import { ARBITRUM_DEPOSIT_TOKENS } from '@/integration/depositTokens';
import { buildInvestableBalanceRows } from '@/integration/investableBalanceRows';
import { balanceForFundingToken } from '@/integration/investAmountModel';

function balances(
  chain: WalletTokenChain,
  result: WalletTokenBalancesResponse['result'],
) {
  return { chain, response: { result } };
}

describe('wallet asset mapping', () => {
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
    expect(balanceForFundingToken(rows, ARBITRUM_DEPOSIT_TOKENS[0])).toEqual(
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
});

describe('wallet asset result and fallback branches', () => {
  it('falls back to brand names when the indexer omits them', () => {
    const assets = buildDesktopWalletAssets([
      balances('base', [
        {
          symbol: 'USDC',
          token_address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
          balance_formatted: '10',
          usd_value: 10,
        },
      ]),
    ]);

    expect(assets).toEqual([
      expect.objectContaining({ symbol: 'USDC', name: 'USD Coin' }),
    ]);

    const rows = buildChainTokenBalanceRows([
      {
        symbol: 'USDC',
        name: '',
        rawAmount: 10,
        usdPrice: 1,
        usdValue: 10,
        amountLabel: '10 USDC',
        chains: ['base'],
        holdings: [
          {
            chain: 'base',
            chainId: 8453,
            tokenAddress: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
            decimals: 6,
            balance: '10',
            balanceBaseUnits: '10000000',
            rawAmount: 10,
            usdValue: 10,
          },
        ],
      } as DesktopWalletAsset,
    ]);
    expect(rows[0]?.token).toEqual({ symbol: 'USDC', name: 'USD Coin' });
  });

  it('assembles the hook result with summed live values and status', async () => {
    const refetch = async () => 'refetched';
    const result = buildWalletAssetsResult(
      {
        data: {
          assets: [
            {
              symbol: 'USDC',
              name: 'USD Coin',
              rawAmount: 10,
              usdPrice: 1,
              usdValue: 100,
              amountLabel: '10 USDC',
              chains: ['base'],
              holdings: [],
            },
            {
              symbol: 'WETH',
              name: 'Wrapped Ether',
              rawAmount: 1,
              usdPrice: 200,
              usdValue: 200,
              amountLabel: '1 WETH',
              chains: ['base'],
              holdings: [],
            },
          ],
          rows: [],
          chainRows: [],
          failedChains: ['base'],
        },
        isLoading: false,
        isError: false,
        error: null,
        refetch,
      },
      true,
    );

    expect(result.totalUsdValue).toBe(300);
    expect(result).toMatchObject({
      isConnected: true,
      isLoading: false,
      isError: false,
      error: null,
      failedChains: ['base'],
    });
    await expect(result.refetch()).resolves.toBe('refetched');

    const disconnected = buildWalletAssetsResult(
      {
        data: null,
        isLoading: true,
        isError: false,
        error: undefined,
        refetch: undefined,
      },
      false,
    );
    expect(disconnected).toMatchObject({
      assets: [],
      rows: [],
      chainRows: [],
      failedChains: [],
      totalUsdValue: null,
      isConnected: false,
      isLoading: false,
      isError: false,
      error: null,
    });
    await expect(disconnected.refetch()).resolves.toBeUndefined();
  });

  it('reports upstream query errors instead of empty values', () => {
    const failure = new Error('wallet balances failed');
    const result = buildWalletAssetsResult(
      {
        data: undefined,
        isLoading: false,
        isError: true,
        error: failure,
        refetch: undefined,
      },
      true,
    );

    expect(result).toMatchObject({
      totalUsdValue: null,
      isConnected: true,
      isLoading: false,
      isError: true,
      error: failure,
    });
  });

  it('treats zero and missing prices as unknown instead of pricing dust', () => {
    expect(
      buildDesktopWalletAssets([
        balances('base', [
          {
            symbol: 'USDC',
            name: 'USD Coin',
            token_address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
            balance_formatted: '0',
            usd_value: 0,
          },
          {
            symbol: 'ETH',
            name: 'Ethereum',
            native_token: true,
          },
        ]),
      ]),
    ).toEqual([]);

    const unpriced = buildDesktopWalletAssets([
      balances('base', [
        {
          symbol: 'USDC',
          name: 'USD Coin',
          token_address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
          balance_formatted: '2',
          usd_value: 0,
        },
      ]),
    ]);
    expect(unpriced[0]).toMatchObject({
      symbol: 'USDC',
      usdValue: null,
      usdPrice: null,
    });

    const rows = buildChainTokenBalanceRows([
      {
        symbol: 'USDC',
        name: 'USD Coin',
        rawAmount: 0,
        usdPrice: null,
        usdValue: 100,
        amountLabel: '0 USDC',
        chains: ['base'],
        holdings: [
          {
            chain: 'base',
            chainId: 8453,
            tokenAddress: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
            decimals: 6,
            balance: '0',
            balanceBaseUnits: '0',
            rawAmount: 0,
            usdValue: 100,
          },
        ],
      } as DesktopWalletAsset,
    ]);
    expect(rows[0]?.usdPrice).toBeNull();
  });

  it('skips unknown chains, missing snapshots, and spam balances', () => {
    const assets = buildDesktopWalletAssets([
      { chain: 'solana', response: { result: [] } } as never,
      {
        chain: 'base',
        response: {},
      } as never,
      balances('base', [
        {
          symbol: 'USDC',
          name: 'Spam Coin',
          token_address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
          balance_formatted: '999',
          usd_value: 999,
          possible_spam: true,
        },
        {
          symbol: 'USDC',
          name: 'USD Coin',
          token_address: '0x833589FCD6EDB6E08F4C7C32D4F71B54BDA02913',
          balance_formatted: '5',
          usd_value: 5,
        },
      ]),
    ]);

    expect(assets).toEqual([
      expect.objectContaining({
        symbol: 'USDC',
        rawAmount: 5,
        usdValue: 5,
        holdings: [
          expect.objectContaining({
            tokenAddress: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
          }),
        ],
      }),
    ]);
  });

  it('accumulates repeated holdings and falls back for sparse chain rows', () => {
    const assets = buildDesktopWalletAssets([
      balances('base', [
        {
          symbol: 'USDC',
          name: 'USD Coin',
          token_address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
          balance_formatted: '10',
          usd_value: 100,
        },
        {
          symbol: 'USDC',
          name: 'USD Coin',
          token_address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
          balance_formatted: '5',
          usd_value: 0,
        },
      ]),
    ]);

    expect(assets[0]).toMatchObject({
      rawAmount: 15,
      usdValue: 100,
      chains: ['base'],
    });
    expect(assets[0]?.holdings).toHaveLength(1);
    expect(assets[0]?.holdings[0]).toMatchObject({
      rawAmount: 15,
      usdValue: 100,
      balanceBaseUnits: '15000000',
    });

    const rows = buildChainTokenBalanceRows([
      {
        symbol: 'USDC',
        name: '',
        rawAmount: 5,
        usdPrice: null,
        usdValue: null,
        amountLabel: '5 USDC',
        chains: ['ethereum'],
        holdings: [
          {
            chain: 'ethereum',
            chainId: 999,
            tokenAddress: null,
            decimals: 6,
            rawAmount: 5,
            usdValue: null,
          },
          {
            chain: 'base',
            chainId: 8453,
            tokenAddress: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
            decimals: 6,
            balance: '3',
            balanceBaseUnits: '3000000',
            rawAmount: 3,
            usdValue: 3,
          },
        ],
      } as DesktopWalletAsset,
    ]);

    expect(rows.map((row) => row.id)).toEqual(['8453:USDC', '999:USDC']);
    const sparse = rows.find((row) => row.id === '999:USDC');
    expect(sparse).toMatchObject({
      chainLabel: '999',
      balance: '5',
      balanceBaseUnits: '5000000',
      usdValue: null,
      usdPrice: null,
      token: { symbol: 'USDC', name: 'USD Coin' },
    });
  });

  it('tolerates malformed and missing indexer amounts without losing USD', () => {
    const assets = buildDesktopWalletAssets([
      balances('base', [
        {
          symbol: 'USDC',
          name: 'USD Coin',
          token_address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
          balance_formatted: 'not-a-number',
          usd_value: 50,
        },
      ]),
      balances('eth', [
        {
          native_token: true,
          usd_value: 3000,
        },
      ]),
    ]);

    const malformed = assets.find((asset) => asset.symbol === 'USDC');
    expect(malformed).toMatchObject({ usdValue: 50, usdPrice: null });
    expect(malformed?.holdings[0]?.balanceBaseUnits).toBe('0');

    const missing = assets.find((asset) => asset.symbol === 'ETH');
    expect(missing).toMatchObject({
      name: 'Ethereum',
      rawAmount: 0,
      usdValue: 3000,
      usdPrice: null,
    });
    expect(missing?.holdings[0]).toMatchObject({
      balance: '0',
      balanceBaseUnits: '0',
    });
  });

  it('orders priced assets before unpriced ones regardless of input order', () => {
    const unpricedFirst = buildDesktopWalletAssets([
      balances('base', [
        {
          symbol: 'WETH',
          name: 'Wrapped Ether',
          token_address: '0x4200000000000000000000000000000000000006',
          balance_formatted: '2',
          usd_value: 0,
        },
      ]),
      balances('base', [
        {
          symbol: 'USDC',
          name: 'USD Coin',
          token_address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
          balance_formatted: '10',
          usd_value: 10,
        },
      ]),
    ]);
    expect(unpricedFirst.map((asset) => asset.symbol)).toEqual([
      'USDC',
      'WETH',
    ]);

    const pricedFirst = buildDesktopWalletAssets([
      balances('base', [
        {
          symbol: 'USDC',
          name: 'USD Coin',
          token_address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
          balance_formatted: '10',
          usd_value: 10,
        },
      ]),
      balances('base', [
        {
          symbol: 'WETH',
          name: 'Wrapped Ether',
          token_address: '0x4200000000000000000000000000000000000006',
          balance_formatted: '2',
          usd_value: 0,
        },
      ]),
    ]);
    expect(pricedFirst.map((asset) => asset.symbol)).toEqual(['USDC', 'WETH']);
    expect(pricedFirst[1]).toMatchObject({ usdValue: null });
  });

  it('sorts sparse chain rows with missing prices last', () => {
    const holdings = [
      {
        chain: 'base',
        chainId: 8453,
        tokenAddress: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
        decimals: 6,
        balance: '5',
        balanceBaseUnits: '5000000',
        rawAmount: 5,
        usdValue: null,
      },
      {
        chain: 'ethereum',
        chainId: 1,
        tokenAddress: null,
        decimals: 6,
        balance: '2',
        balanceBaseUnits: '2000000',
        rawAmount: 2,
        usdValue: 2,
      },
      {
        chain: 'arbitrum',
        chainId: 42161,
        tokenAddress: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
        decimals: 6,
        balance: '1',
        balanceBaseUnits: '1000000',
        rawAmount: 1,
        usdValue: 1,
      },
    ] as DesktopWalletAsset['holdings'];

    for (const ordered of [holdings, [...holdings].reverse()]) {
      const rows = buildChainTokenBalanceRows([
        {
          symbol: 'USDC',
          name: 'USD Coin',
          rawAmount: 8,
          usdPrice: null,
          usdValue: 8,
          amountLabel: '8 USDC',
          chains: ['base', 'ethereum', 'arbitrum'],
          holdings: ordered,
        } as DesktopWalletAsset,
      ]);

      expect(rows.map((row) => row.usdValue)).toEqual([2, 1, null]);
    }
  });

  it('renders corrupt holdings as zero units instead of crashing', () => {
    const rows = buildChainTokenBalanceRows([
      {
        symbol: 'USDC',
        name: 'USD Coin',
        rawAmount: Number.NaN,
        usdPrice: null,
        holdings: [
          {
            chain: 'base',
            chainId: 8453,
            tokenAddress: null,
            decimals: 6,
            rawAmount: Number.NaN,
            usdValue: null,
          },
        ],
      } as unknown as DesktopWalletAsset,
    ]);

    expect(rows[0]).toMatchObject({
      balance: 'NaN',
      balanceBaseUnits: '0',
      usdPrice: null,
    });
  });
});
