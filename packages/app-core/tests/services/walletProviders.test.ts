import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureAppCoreEnv } from '../../src/lib/env/runtimeEnv';
import {
  getAlchemyWalletBalancesSnapshot,
  getAlchemyWalletTokenBalances,
} from '../../src/services/alchemyWalletService';
import {
  getSupportedWalletTokenSymbol,
  normalizeSupportedWalletTokenSymbol,
  SUPPORTED_WALLET_TOKEN_ADDRESSES_BY_CHAIN as addresses,
} from '../../src/services/walletTokenCatalog';

const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  configureAppCoreEnv({
    VITE_ALCHEMY_API_KEY: ' test-key ',
  });
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
  configureAppCoreEnv({});
});
function alchemyResponses(
  options: {
    pricesFail?: boolean;
    failedNetwork?: string;
    invalidRpc?: boolean;
    rpcErrorWithoutMessage?: boolean;
    empty?: boolean;
  } = {},
) {
  fetchMock.mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.includes('/prices/')) {
      if (options.pricesFail)
        return Response.json({ message: 'denied' }, { status: 403 });
      if (url.includes('by-symbol'))
        return Response.json({
          data: [
            { symbol: 'eth', prices: [{ currency: 'usd', value: '2000' }] },
            { prices: [] },
          ],
        });
      return Response.json({
        data: [
          {
            network: 'eth-mainnet',
            address: addresses.eth.USDC[0].toUpperCase(),
            prices: [
              { currency: 'EUR', value: 99 },
              { currency: 'USD', price: '1.01' },
            ],
          },
          { address: 'invalid', prices: [{ value: null }] },
        ],
      });
    }
    if (options.failedNetwork && url.includes(options.failedNetwork))
      return Response.json({ error: { message: 'RPC unavailable' } });
    if (options.invalidRpc) return Response.json({});
    if (options.rpcErrorWithoutMessage) return Response.json({ error: {} });
    const rpc = JSON.parse(String(init?.body));
    if (rpc.method === 'eth_getBalance')
      return Response.json({
        result: options.empty ? '0x0' : '0xde0b6b3a7640000',
      });
    const chain = url.includes('eth-mainnet')
      ? 'eth'
      : url.includes('base-mainnet')
        ? 'base'
        : 'arbitrum';
    return Response.json({
      result: options.empty
        ? {}
        : {
            tokenBalances: [
              {
                contractAddress: addresses[chain].USDC[0],
                tokenBalance: '0x1e8480',
              },
              {
                contractAddress: addresses[chain].WETH[0],
                tokenBalance: '0xde0b6b3a7640000',
              },
              {
                contractAddress: addresses[chain].USDC[0],
                tokenBalance: 'invalid',
              },
              { contractAddress: addresses[chain].USDC[0], tokenBalance: null },
              { contractAddress: '0xunknown', tokenBalance: '0x01' },
            ],
          },
    });
  });
}
describe('Alchemy transport and balance aggregation', () => {
  it('formats balances, prefers USD quotes and retains unpriced supported tokens', async () => {
    alchemyResponses();
    const result = await getAlchemyWalletBalancesSnapshot('0xwallet');
    expect(result.failedChains).toEqual([]);
    expect(result.balances.map((b) => b.chain)).toEqual([
      'eth',
      'base',
      'arbitrum',
    ]);
    expect(result.balances[0]?.response.result).toMatchObject([
      {
        symbol: 'USDC',
        balance_formatted: '2',
        usd_price: 1.01,
        usd_value: 2.02,
      },
      {
        symbol: 'WETH',
        balance_formatted: '1',
        usd_price: null,
        usd_value: null,
      },
      {
        symbol: 'ETH',
        native_token: true,
        balance_formatted: '1',
        usd_price: 2000,
        usd_value: 2000,
      },
    ]);
    expect(result.balances[1]?.response.result[0]).toMatchObject({
      usd_price: 1,
      usd_value: 2,
    });
    const rpcCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes('eth-mainnet'),
    )!;
    expect(JSON.parse(String(rpcCall[1]?.body))).toMatchObject({
      jsonrpc: '2.0',
      method: 'alchemy_getTokenBalances',
      params: ['0xwallet', expect.arrayContaining([addresses.eth.USDC[0]])],
    });
    expect(String(rpcCall[0])).toBe(
      'https://eth-mainnet.g.alchemy.com/v2/test-key',
    );
  });
  it('survives blocked price service and partial RPC failure', async () => {
    alchemyResponses({ pricesFail: true, failedNetwork: 'base-mainnet' });
    const result = await getAlchemyWalletBalancesSnapshot('0xwallet');
    expect(result.failedChains).toEqual(['base']);
    expect(result.balances.map((b) => b.chain)).toEqual(['eth', 'arbitrum']);
    expect(result.balances[0]?.response.result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ symbol: 'USDC', usd_value: 2 }),
        expect.objectContaining({ symbol: 'ETH', usd_value: null }),
      ]),
    );
  });
  it('reports total RPC failure and missing result instead of empty success', async () => {
    alchemyResponses({ invalidRpc: true });
    await expect(getAlchemyWalletBalancesSnapshot('0xwallet')).rejects.toThrow(
      'did not include a result',
    );
    alchemyResponses({ failedNetwork: '.g.alchemy.com/v2/' });
    await expect(getAlchemyWalletBalancesSnapshot('0xwallet')).rejects.toThrow(
      'RPC unavailable',
    );
    alchemyResponses({ rpcErrorWithoutMessage: true });
    await expect(getAlchemyWalletBalancesSnapshot('0xwallet')).rejects.toThrow(
      'unknown error',
    );
  });
  it('supports genuinely empty wallets and checks configuration before transport', async () => {
    alchemyResponses({ empty: true });
    expect(
      (await getAlchemyWalletTokenBalances('0xwallet')).every(
        (b) => b.response.result.length === 0,
      ),
    ).toBe(true);
    fetchMock.mockClear();
    configureAppCoreEnv({ VITE_ALCHEMY_API_KEY: ' ' });
    await expect(getAlchemyWalletBalancesSnapshot('0xwallet')).rejects.toThrow(
      'Missing VITE_ALCHEMY_API_KEY',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
describe('supported token identity', () => {
  it('trusts canonical chain addresses and rejects conflicting or spoofed symbols', () => {
    expect(getSupportedWalletTokenSymbol('eth', { native_token: true })).toBe(
      'ETH',
    );
    expect(
      getSupportedWalletTokenSymbol('eth', {
        token_address: addresses.eth.USDC[0].toUpperCase(),
        symbol: 'USDC',
      }),
    ).toBe('USDC');
    expect(
      getSupportedWalletTokenSymbol('eth', {
        token_address: addresses.eth.USDC[0],
        symbol: 'WBTC',
      }),
    ).toBeNull();
    expect(getSupportedWalletTokenSymbol('eth', { symbol: 'USDC' })).toBeNull();
    expect(
      getSupportedWalletTokenSymbol('eth', {
        symbol: 'USDC',
        token_address: '0xunknown',
      }),
    ).toBeNull();
    expect(
      ['usdc', 'usdt', 'eth', 'weth', 'wbtc', ' cbBTC ', 'junk'].map(
        normalizeSupportedWalletTokenSymbol,
      ),
    ).toEqual(['USDC', 'USDT', 'ETH', 'WETH', 'WBTC', 'CBBTC', null]);
    expect(normalizeSupportedWalletTokenSymbol(null)).toBeNull();
  });
});
