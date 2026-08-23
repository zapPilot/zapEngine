import { useQuery } from '@tanstack/react-query';
import {
  createQueryConfig,
  queryKeys,
} from '@zapengine/app-core/hooks/queries';
import { getAlchemyWalletBalancesSnapshot } from '@zapengine/app-core/services';

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
  const walletAddresses = normalizeWalletAddressList(addressInput);
  const enabled = walletAddresses.length > 0;
  const query = useQuery<WalletAssetsQueryData, Error>({
    ...createQueryConfig({ dataType: 'volatile' }),
    queryKey: queryKeys.desktop.walletAssets(walletAddresses),
    enabled,
    // Balances gate the invest flow's amount step, so they stay fresher than
    // the shared volatile window.
    staleTime: 60 * 1000,
    queryFn: async () => {
      const snapshots = await Promise.all(
        walletAddresses.map((address) =>
          getAlchemyWalletBalancesSnapshot(address),
        ),
      );
      const responses = snapshots.flatMap((snapshot) => snapshot.balances);
      const assets = buildDesktopWalletAssets(responses);
      return {
        assets,
        rows: buildInvestableBalanceRows(assets),
        chainRows: buildChainTokenBalanceRows(assets),
        failedChains: Array.from(
          new Set(snapshots.flatMap((snapshot) => snapshot.failedChains)),
        ),
      };
    },
  });

  return buildWalletAssetsResult(query, enabled);
}
