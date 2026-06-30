import { useQuery } from '@tanstack/react-query';
import { getRuntimeEnv } from '@zapengine/app-core/lib/env/runtimeEnv';
import {
  getAlchemyWalletTokenBalances,
  getMoralisWalletTokenBalances,
} from '@zapengine/app-core/services';

import {
  buildDesktopWalletAssets,
  buildInvestableBalanceRows,
  buildWalletAssetsResult,
  type DesktopWalletAsset,
  type DesktopWalletAssetHolding,
  type InvestableBalanceRow,
  normalizeWalletAddressList,
  type UseMoralisWalletAssetsResult,
  type WalletAddressInput,
  type WalletChainBalancesLike,
} from '@/integration/moralisWallet';

export type WalletTokenProviderId = 'alchemy' | 'moralis';

export type {
  DesktopWalletAsset,
  DesktopWalletAssetHolding,
  InvestableBalanceRow,
  UseMoralisWalletAssetsResult as UseWalletAssetsResult,
  WalletAddressInput,
};

interface WalletTokenProvider {
  id: WalletTokenProviderId;
  getTokenBalances: (address: string) => Promise<WalletChainBalancesLike[]>;
}

const ALCHEMY_WALLET_TOKEN_PROVIDER: WalletTokenProvider = {
  id: 'alchemy',
  getTokenBalances: getAlchemyWalletTokenBalances,
};

const MORALIS_WALLET_TOKEN_PROVIDER: WalletTokenProvider = {
  id: 'moralis',
  getTokenBalances: getMoralisWalletTokenBalances,
};

export function resolveWalletTokenProvider(): WalletTokenProviderId {
  const provider = getRuntimeEnv('VITE_DESKTOP_WALLET_PROVIDER')
    ?.trim()
    .toLowerCase();
  return provider === 'moralis' ? 'moralis' : 'alchemy';
}

function getWalletTokenProvider(): WalletTokenProvider {
  return resolveWalletTokenProvider() === 'moralis'
    ? MORALIS_WALLET_TOKEN_PROVIDER
    : ALCHEMY_WALLET_TOKEN_PROVIDER;
}

export function useWalletAssets(
  addressInput: WalletAddressInput,
): UseMoralisWalletAssetsResult {
  const provider = getWalletTokenProvider();
  const walletAddresses = normalizeWalletAddressList(addressInput);
  const enabled = walletAddresses.length > 0;
  const query = useQuery({
    queryKey: ['desktop', provider.id, 'wallet-assets', walletAddresses],
    enabled,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const responses = (
        await Promise.all(
          walletAddresses.map((address) => provider.getTokenBalances(address)),
        )
      ).flat();
      const assets = buildDesktopWalletAssets(responses);
      return {
        assets,
        rows: buildInvestableBalanceRows(assets),
      };
    },
  });

  return buildWalletAssetsResult(query, enabled);
}
