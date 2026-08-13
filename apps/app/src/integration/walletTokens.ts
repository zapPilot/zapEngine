import { useQuery } from '@tanstack/react-query';
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
  type UseMoralisWalletAssetsResult,
  type WalletAddressInput,
} from '@/integration/moralisWallet';

export type {
  DesktopWalletAsset,
  DesktopWalletAssetHolding,
  ChainTokenBalanceRow,
  InvestableBalanceRow,
  UseMoralisWalletAssetsResult as UseWalletAssetsResult,
  WalletAddressInput,
};

export function useWalletAssets(
  addressInput: WalletAddressInput,
): UseMoralisWalletAssetsResult {
  const walletAddresses = normalizeWalletAddressList(addressInput);
  const enabled = walletAddresses.length > 0;
  const query = useQuery({
    queryKey: ['desktop', 'alchemy', 'wallet-assets', walletAddresses],
    enabled,
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
