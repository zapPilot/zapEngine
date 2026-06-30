import {
  type AlchemyWalletTokenBalance,
  getAlchemyWalletTokenBalances,
} from '@zapengine/app-core/services';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface FetchCall {
  url: string;
  init: RequestInit;
}

interface JsonRpcBody {
  method: string;
  params: unknown[];
}

interface PriceAddressRequest {
  address: string;
  network: string;
}

const fetchMock = vi.hoisted(() => vi.fn());

const TEST_WALLET = '0x1234567890123456789012345678901234567890';

function tokenBySymbol(
  balances: AlchemyWalletTokenBalance[],
  symbol: string,
): AlchemyWalletTokenBalance | undefined {
  return balances.find((balance) => balance.symbol === symbol);
}

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as Response;
}

function findJsonRpcCall(method: string, network: string): FetchCall {
  for (const call of fetchMock.mock.calls) {
    const fetchCall = {
      url: String(call[0]),
      init: call[1] as RequestInit,
    };
    if (!fetchCall.url.includes(`${network}.g.alchemy.com`)) {
      continue;
    }
    try {
      if (rpcBody(fetchCall.init).method === method) {
        return fetchCall;
      }
    } catch {
      continue;
    }
  }
  throw new Error(`Missing ${method} call for ${network}`);
}

function rpcBody(init: RequestInit): JsonRpcBody {
  return JSON.parse(String(init.body)) as JsonRpcBody;
}

describe('Alchemy wallet service', () => {
  beforeEach(() => {
    process.env['VITE_ALCHEMY_API_KEY'] = 'test-alchemy-key';
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env['VITE_ALCHEMY_API_KEY'];
  });

  it('surfaces a clear error when the Alchemy API key is missing', async () => {
    delete process.env['VITE_ALCHEMY_API_KEY'];

    await expect(getAlchemyWalletTokenBalances(TEST_WALLET)).rejects.toThrow(
      'Missing VITE_ALCHEMY_API_KEY',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetches supported ERC-20 balances with address arrays and native ETH balances', async () => {
    fetchMock.mockImplementation(
      async (urlInput: string, init: RequestInit) => {
        const url = String(urlInput);
        if (url.includes('/tokens/by-symbol')) {
          return jsonResponse({
            data: [
              {
                symbol: 'ETH',
                prices: [{ currency: 'USD', value: '2000' }],
              },
            ],
          });
        }

        if (url.includes('/tokens/by-address')) {
          const body = JSON.parse(String(init.body)) as {
            addresses: PriceAddressRequest[];
          };
          return jsonResponse({
            data: body.addresses.map((request) => ({
              address: request.address,
              network: request.network,
              prices: [
                {
                  currency: 'usd',
                  value:
                    request.address.toLowerCase() ===
                    '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599'
                      ? '100000'
                      : '1',
                },
              ],
            })),
          });
        }

        const body = rpcBody(init);
        const network = new URL(url).hostname.split('.')[0] ?? '';
        if (body.method === 'eth_getBalance') {
          return jsonResponse({
            result: network === 'eth-mainnet' ? '0xde0b6b3a7640000' : '0x0',
          });
        }

        const contractAddresses = body.params[1] as string[];
        return jsonResponse({
          result: {
            address: TEST_WALLET.toLowerCase(),
            tokenBalances: [
              ...contractAddresses.map((contractAddress) => ({
                contractAddress,
                tokenBalance:
                  network === 'eth-mainnet' &&
                  contractAddress.toLowerCase() ===
                    '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599'
                    ? '0x2710'
                    : '0x0',
              })),
              {
                contractAddress: '0x0000000000000000000000000000000000000001',
                tokenBalance: '0xde0b6b3a7640000',
              },
            ],
          },
        });
      },
    );

    const balances = await getAlchemyWalletTokenBalances(TEST_WALLET);
    const ethBalances = balances.find((entry) => entry.chain === 'eth');
    const tokenBalanceCall = findJsonRpcCall(
      'alchemy_getTokenBalances',
      'eth-mainnet',
    );
    const tokenBalanceBody = rpcBody(tokenBalanceCall.init);

    expect(tokenBalanceCall.url).toBe(
      'https://eth-mainnet.g.alchemy.com/v2/test-alchemy-key',
    );
    expect(tokenBalanceBody).toMatchObject({
      method: 'alchemy_getTokenBalances',
      params: [
        TEST_WALLET,
        expect.arrayContaining([
          '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
          '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599',
        ]),
      ],
    });
    expect(Array.isArray(tokenBalanceBody.params[1])).toBe(true);
    expect(ethBalances?.response.result.map((row) => row.symbol)).toEqual([
      'WBTC',
      'ETH',
    ]);
    expect(tokenBySymbol(ethBalances?.response.result ?? [], 'WBTC')).toEqual(
      expect.objectContaining({
        balance_formatted: '0.0001',
        token_address: '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599',
        usd_price: 100000,
        usd_value: 10,
      }),
    );
    expect(tokenBySymbol(ethBalances?.response.result ?? [], 'ETH')).toEqual(
      expect.objectContaining({
        balance_formatted: '1',
        native_token: true,
        usd_price: 2000,
        usd_value: 2000,
      }),
    );
    expect(
      ethBalances?.response.result.some(
        (row) =>
          row.token_address === '0x0000000000000000000000000000000000000001',
      ),
    ).toBe(false);
  });
});
