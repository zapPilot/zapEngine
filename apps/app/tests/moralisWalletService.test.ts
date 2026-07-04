import {
  getMoralisWalletHistory,
  getMoralisWalletTokenBalances,
} from '@zapengine/app-core/services';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.hoisted(() => vi.fn());

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as Response;
}

describe('Moralis wallet service', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    process.env['VITE_MORALIS_API_KEY'] = 'test-moralis-key';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env['VITE_MORALIS_API_KEY'];
  });

  it('fetches token balances for eth, base, and arbitrum with strict query flags', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ result: [] }));

    await getMoralisWalletTokenBalances(
      '0x1234567890123456789012345678901234567890',
    );

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const urls = fetchMock.mock.calls.map(([url]) => new URL(String(url)));

    expect(urls.map((url) => url.searchParams.get('chain'))).toEqual([
      'eth',
      'base',
      'arbitrum',
    ]);
    for (const url of urls) {
      expect(url.pathname).toBe(
        '/api/v2.2/wallets/0x1234567890123456789012345678901234567890/tokens',
      );
      expect(url.searchParams.get('exclude_native')).toBe('false');
      expect(url.searchParams.get('exclude_spam')).toBe('true');
      expect(url.searchParams.get('exclude_unverified_contracts')).toBe('true');
      expect(url.searchParams.get('token_addresses')).toMatch(/^0x/);
    }
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: expect.objectContaining({ 'X-API-Key': 'test-moralis-key' }),
    });
  });

  it('fetches wallet history for eth, base, and arbitrum with first-page options', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ result: [], cursor: null }));

    await getMoralisWalletHistory('0x1234567890123456789012345678901234567890');

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const urls = fetchMock.mock.calls.map(([url]) => new URL(String(url)));

    expect(urls.map((url) => url.searchParams.get('chain'))).toEqual([
      'eth',
      'base',
      'arbitrum',
    ]);
    for (const url of urls) {
      expect(url.pathname).toBe(
        '/api/v2.2/wallets/0x1234567890123456789012345678901234567890/history',
      );
      expect(url.searchParams.get('limit')).toBe('10');
      expect(url.searchParams.get('order')).toBe('DESC');
    }
  });

  it('surfaces a clear error when the Moralis API key is missing', async () => {
    delete process.env['VITE_MORALIS_API_KEY'];

    await expect(
      getMoralisWalletTokenBalances(
        '0x1234567890123456789012345678901234567890',
      ),
    ).rejects.toThrow('Missing VITE_MORALIS_API_KEY');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
