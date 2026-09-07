// @vitest-environment jsdom
import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  AlchemyWalletBalancesSnapshot,
  AlchemyWalletChain,
} from '@zapengine/app-core/services';

import type { WalletAssetsQueryData } from '@/integration/moralisWallet';
import {
  useWalletAssets,
  type UseWalletAssetsResult,
  type WalletAddressInput,
} from '@/integration/walletTokens';

const useQueryMock = vi.hoisted(() => vi.fn());
const getSnapshotMock = vi.hoisted(() => vi.fn());
const refetchMock = vi.hoisted(() => vi.fn());

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return {
    ...actual,
    useQuery: useQueryMock,
  };
});

vi.mock('@zapengine/app-core/services', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@zapengine/app-core/services')>();
  return {
    ...actual,
    getAlchemyWalletBalancesSnapshot: getSnapshotMock,
  };
});

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const WALLET_A = '0x1111111111111111111111111111111111111111';
const WALLET_B = '0x2222222222222222222222222222222222222222';
const WALLET_MIXED_CASE = '0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD';

/** Native ETH avoids the ERC-20 address catalog while still producing an asset. */
function nativeEthSnapshot(
  chain: AlchemyWalletChain,
  amount: number,
): AlchemyWalletBalancesSnapshot {
  return {
    balances: [
      {
        chain,
        response: {
          result: [
            {
              symbol: 'ETH',
              name: 'Ethereum',
              token_address: null,
              native_token: true,
              balance_formatted: String(amount),
              usd_value: amount * 2000,
              usd_price: 2000,
            },
          ],
        },
      },
    ],
    failedChains: [],
  };
}

function WalletAssetsCapture({
  addresses,
  onResult,
}: {
  addresses: WalletAddressInput;
  onResult: (result: UseWalletAssetsResult) => void;
}): ReactElement | null {
  onResult(useWalletAssets(addresses));
  return null;
}

async function renderWalletAssets(addresses: WalletAddressInput) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const results: UseWalletAssetsResult[] = [];
  const element = (next: WalletAddressInput) =>
    createElement(WalletAssetsCapture, {
      addresses: next,
      onResult: (result) => {
        results.push(result);
      },
    });
  let root: Root | undefined;
  await act(async () => {
    root = createRoot(container);
    root.render(element(addresses));
  });
  if (results.length === 0 || !root) {
    throw new Error('Wallet assets hook did not render');
  }
  return {
    results,
    rerender: async (next: WalletAddressInput) => {
      await act(async () => {
        root?.render(element(next));
      });
    },
    unmount: async () => {
      await act(async () => {
        root?.unmount();
      });
      container.remove();
    },
  };
}

/** The hook builds the query options; running the real fetch means calling them. */
function latestQueryOptions(): {
  enabled: boolean;
  queryKey: unknown;
  queryFn: () => Promise<WalletAssetsQueryData>;
} {
  const options = useQueryMock.mock.calls.at(-1)?.[0] as
    | {
        enabled: boolean;
        queryKey: unknown;
        queryFn: () => Promise<WalletAssetsQueryData>;
      }
    | undefined;
  if (!options) {
    throw new Error('useQuery was never called');
  }
  return options;
}

beforeEach(() => {
  vi.clearAllMocks();
  useQueryMock.mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    refetch: refetchMock,
  });
});

describe('wallet token balances', () => {
  it('reads token balances from Alchemy', async () => {
    const rendered = await renderWalletAssets(WALLET_A);

    expect(latestQueryOptions()).toMatchObject({
      enabled: true,
      queryKey: ['desktop', 'alchemy', 'wallet-assets', [WALLET_A]],
    });
    await rendered.unmount();
  });

  it('normalizes and deduplicates a bundle before building the query', async () => {
    const rendered = await renderWalletAssets([
      ` ${WALLET_MIXED_CASE} `,
      WALLET_MIXED_CASE.toLowerCase(),
    ]);

    expect(latestQueryOptions()).toMatchObject({
      enabled: true,
      queryKey: [
        'desktop',
        'alchemy',
        'wallet-assets',
        [WALLET_MIXED_CASE.toLowerCase()],
      ],
    });
    await rendered.unmount();
  });

  it('disables the balance query for an empty bundle', async () => {
    const rendered = await renderWalletAssets([]);

    expect(latestQueryOptions()).toMatchObject({ enabled: false });
    await rendered.unmount();
  });

  it('merges every wallet in the bundle when all of them resolve', async () => {
    getSnapshotMock.mockImplementation(async (address: string) =>
      address === WALLET_A
        ? nativeEthSnapshot('eth', 1)
        : nativeEthSnapshot('base', 2),
    );
    const rendered = await renderWalletAssets([WALLET_A, WALLET_B]);

    const data = await latestQueryOptions().queryFn();

    expect(getSnapshotMock).toHaveBeenCalledTimes(2);
    expect(data.assets).toHaveLength(1);
    expect(data.assets[0]?.rawAmount).toBe(3);
    expect(data.assets[0]?.chains).toEqual(['ethereum', 'base']);
    // One row per wallet survives, ordered by USD value.
    expect(
      data.chainRows.map((row) => [row.chain, row.usdValue] as const),
    ).toEqual([
      ['base', 4000],
      ['ethereum', 2000],
    ]);
    expect(data.failedChains).toEqual([]);
    await rendered.unmount();
  });

  it('keeps a surviving wallet and reports the failed one on every chain', async () => {
    getSnapshotMock.mockImplementation(async (address: string) => {
      if (address === WALLET_B) {
        throw new Error('Alchemy rejected the configured API key.');
      }
      return nativeEthSnapshot('eth', 1);
    });
    const rendered = await renderWalletAssets([WALLET_A, WALLET_B]);

    const data = await latestQueryOptions().queryFn();

    expect(data.assets[0]?.rawAmount).toBe(1);
    // A failed wallet has no address slot in `failedChains`, so every chain it
    // would have contributed is marked instead — otherwise the total silently
    // drops a whole wallet while the card still claims to be live.
    expect(data.failedChains).toEqual(['eth', 'base', 'arbitrum']);
    await rendered.unmount();
  });

  it('rejects when no wallet in the bundle resolves', async () => {
    getSnapshotMock.mockRejectedValue(
      new Error('Alchemy rate limit reached for wallet data.'),
    );
    const rendered = await renderWalletAssets([WALLET_A, WALLET_B]);

    await expect(latestQueryOptions().queryFn()).rejects.toThrow(
      'Alchemy rate limit reached for wallet data.',
    );
    await rendered.unmount();
  });

  it('keeps one identity for the same bundle across renders', async () => {
    const rendered = await renderWalletAssets([WALLET_A, WALLET_B]);

    // A fresh array with identical contents: callers rebuild it every render.
    await rendered.rerender([` ${WALLET_A} `, WALLET_B]);

    expect(rendered.results.length).toBeGreaterThan(1);
    expect(rendered.results.at(-1)).toBe(rendered.results[0]);
    // The key factory rebuilds its own array, so the stable part to check is
    // the normalized address list react-query hashes and diffs on.
    const [first, second] = useQueryMock.mock.calls.map(
      (call) => (call[0] as { queryKey: readonly unknown[] }).queryKey[3],
    );
    expect(second).toBe(first);
    expect(first).toEqual([WALLET_A, WALLET_B]);
    await rendered.unmount();
  });
});
