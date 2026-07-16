import { useQuery } from '@tanstack/react-query';
import { getRuntimeEnv } from '@zapengine/app-core/lib/env/runtimeEnv';
import {
  getAlchemyWalletBalancesSnapshot,
  getMoralisWalletTokenBalances,
} from '@zapengine/app-core/services';

import {
  buildDesktopWalletAssets,
  buildChainTokenBalanceRows,
  buildInvestableBalanceRows,
  buildWalletAssetsResult,
  type DesktopWalletAsset,
  type DesktopWalletAssetHolding,
  type ChainTokenBalanceRow,
  type InvestableBalanceRow,
  type MoralisChainKey,
  normalizeWalletAddressList,
  type UseMoralisWalletAssetsResult,
  type WalletAddressInput,
  type WalletChainBalancesLike,
} from '@/integration/moralisWallet';

export type WalletTokenProviderId = 'alchemy' | 'moralis';

export type {
  DesktopWalletAsset,
  DesktopWalletAssetHolding,
  ChainTokenBalanceRow,
  InvestableBalanceRow,
  UseMoralisWalletAssetsResult as UseWalletAssetsResult,
  WalletAddressInput,
};

interface WalletTokenProvider {
  id: WalletTokenProviderId;
  getTokenBalances: (address: string) => Promise<WalletTokenProviderSnapshot>;
}

interface WalletTokenProviderSnapshot {
  balances: WalletChainBalancesLike[];
  failedChains: MoralisChainKey[];
}

const ALCHEMY_WALLET_TOKEN_PROVIDER: WalletTokenProvider = {
  id: 'alchemy',
  getTokenBalances: async (address) => {
    const snapshot = await getAlchemyWalletBalancesSnapshot(address);
    return {
      balances: snapshot.balances,
      failedChains: snapshot.failedChains,
    };
  },
};

const MORALIS_WALLET_TOKEN_PROVIDER: WalletTokenProvider = {
  id: 'moralis',
  getTokenBalances: async (address) => ({
    balances: await getMoralisWalletTokenBalances(address),
    failedChains: [],
  }),
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
      const snapshots = await Promise.all(
        walletAddresses.map((address) => provider.getTokenBalances(address)),
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
