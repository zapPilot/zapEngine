import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  resolveWalletTokenProvider,
  useWalletAssets,
} from '../src/integration/walletTokens';

const useQueryMock = vi.hoisted(() => vi.fn());

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return {
    ...actual,
    useQuery: useQueryMock,
  };
});

beforeEach(() => {
  delete process.env['VITE_DESKTOP_WALLET_PROVIDER'];
  useQueryMock.mockReset();
  useQueryMock.mockReturnValue({
    data: { assets: [], rows: [] },
    isLoading: false,
    isError: false,
    error: null,
  });
});

describe('desktop wallet token provider', () => {
  it('defaults token balance reads to Alchemy', () => {
    expect(resolveWalletTokenProvider()).toBe('alchemy');

    useWalletAssets('0x1234567890123456789012345678901234567890');

    expect(useQueryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: [
          'desktop',
          'alchemy',
          'wallet-assets',
          ['0x1234567890123456789012345678901234567890'],
        ],
      }),
    );
  });

  it('can switch token balance reads back to Moralis by env override', () => {
    process.env['VITE_DESKTOP_WALLET_PROVIDER'] = 'moralis';

    expect(resolveWalletTokenProvider()).toBe('moralis');

    useWalletAssets('0x1234567890123456789012345678901234567890');

    expect(useQueryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: [
          'desktop',
          'moralis',
          'wallet-assets',
          ['0x1234567890123456789012345678901234567890'],
        ],
      }),
    );
  });
});
