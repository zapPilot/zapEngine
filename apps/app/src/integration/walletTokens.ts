import { useQuery } from '@tanstack/react-query';
import {
  createQueryConfig,
  queryKeys,
} from '@zapengine/app-core/hooks/queries';
import {
  ALCHEMY_WALLET_CHAINS,
  getAlchemyWalletBalancesSnapshot,
} from '@zapengine/app-core/services';
import { useMemo } from 'react';

import {
  buildDesktopWalletAssets,
  buildChainTokenBalanceRows,
  buildInvestableBalanceRows,
  buildWalletAssetsResult,
  type DesktopWalletAsset,
  type DesktopWalletAssetHolding,
  type ChainTokenBalanceRow,
  type InvestableBalanceRow,
  normalizeWalletAddressList,
  type UseWalletAssetsResult,
  type WalletAddressInput,
  type WalletAssetsQueryData,
} from '@/integration/moralisWallet';

export type {
  DesktopWalletAsset,
  DesktopWalletAssetHolding,
  ChainTokenBalanceRow,
  InvestableBalanceRow,
  UseWalletAssetsResult,
  WalletAddressInput,
};

export { normalizeWalletAddressList };

export function useWalletAssets(
  addressInput: WalletAddressInput,
): UseWalletAssetsResult {
  // Callers rebuild the bundle array on every render, so the memo has to key
  // on the normalized contents rather than the argument's identity. The JSON
  // round-trip is exact for a string list; a delimiter join would not be.
  const addressKey = JSON.stringify(normalizeWalletAddressList(addressInput));
  const walletAddresses = useMemo(
    () => JSON.parse(addressKey) as string[],
    [addressKey],
  );
  const enabled = walletAddresses.length > 0;
  const query = useQuery<WalletAssetsQueryData, Error>({
    ...createQueryConfig({ dataType: 'volatile' }),
    queryKey: queryKeys.desktop.walletAssets(walletAddresses),
    enabled,
    // Balances gate the invest flow's amount step, so they stay fresher than
    // the shared volatile window.
    staleTime: 60 * 1000,
    queryFn: async () => {
      const settled = await Promise.allSettled(
        walletAddresses.map((address) =>
          getAlchemyWalletBalancesSnapshot(address),
        ),
      );
      const snapshots = settled.flatMap((result) =>
        result.status === 'fulfilled' ? [result.value] : [],
      );
      const failures = settled.filter(
        (result): result is PromiseRejectedResult =>
          result.status === 'rejected',
      );
      // Zero surviving wallets is a hard failure: resolving here would render
      // an empty—but "live"—wallet card instead of the error/retry state.
      if (snapshots.length === 0 && failures.length > 0) {
        throw failures[0]?.reason instanceof Error
          ? failures[0].reason
          : new Error('Wallet balance requests failed for every wallet.');
      }
      const assets = buildDesktopWalletAssets(
        snapshots.flatMap((snapshot) => snapshot.balances),
      );
      return {
        assets,
        rows: buildInvestableBalanceRows(assets),
        chainRows: buildChainTokenBalanceRows(assets),
        // `failedChains` carries chains, not addresses, so a wallet that failed
        // outright has nowhere of its own to be recorded. Its balances are
        // missing from every chain, so claiming every chain is the honest
        // reading: the partial badge fires and the per-chain invest guards stop
        // trusting a total that silently lost a whole wallet.
        failedChains: Array.from(
          new Set([
            ...(failures.length > 0 ? ALCHEMY_WALLET_CHAINS : []),
            ...snapshots.flatMap((snapshot) => snapshot.failedChains),
          ]),
        ),
      };
    },
  });

  // react-query hands back a fresh wrapper every render, so the memo has to
  // depend on the fields it actually reads rather than on the query object.
  const { data, error, isError, isLoading, refetch } = query;

  return useMemo(
    () =>
      buildWalletAssetsResult(
        { data, error, isError, isLoading, refetch },
        enabled,
      ),
    [data, enabled, error, isError, isLoading, refetch],
  );
}
