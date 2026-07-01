import { QueryClient, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useWalletProvider } from '../../providers/WalletProvider';
import {
  type BundleUser,
  generateBundleUrl,
  getBundleUser,
  isOwnBundle as isBundleOwned,
} from '../../services/bundleService';
import { useUser } from '../queries/wallet/useUser';
import {
  buildBundlePageUrl,
  buildUserBundleParams,
  computeIsDifferentUser,
  computeRedirectUrl,
  computeShowEmailBanner,
  computeShowQuickSwitch,
  EMPTY_CONNECTED_WALLETS,
  findWalletByAddress,
  noopSwitchActiveWallet,
  performWalletSwitchAndRefresh,
  shouldAttemptAutoSwitch,
  shouldRedirectDisconnectedOwner,
} from './useBundlePageUtils';

export {
  buildBundlePageUrl,
  buildUserBundleParams,
  computeIsDifferentUser,
  computeRedirectUrl,
  computeShowEmailBanner,
  computeShowQuickSwitch,
} from './useBundlePageUtils';

export interface BundlePageRouter {
  replace: (url: string) => void;
}

export interface UseBundlePageInput {
  userId: string;
  walletId?: string;
  router: BundlePageRouter;
  search?: string;
}

export interface UseBundlePageResult {
  isOwnBundle: boolean;
  bundleUrl: string;
  bundleUser: BundleUser | null;
  bundleNotFound: boolean;
  showConnectCTA: boolean;
  switchPrompt: {
    show: boolean;
    onStay: () => void;
    onSwitch: () => void;
  };
  emailBanner: {
    show: boolean;
    onSubscribe: () => void;
    onDismiss: () => void;
  };
  overlays: {
    showQuickSwitch: boolean;
    isWalletManagerOpen: boolean;
    openWalletManager: () => void;
    closeWalletManager: () => void;
    onEmailSubscribed: () => void;
  };
}

const useSafeQueryClient = (fallback: QueryClient): QueryClient => {
  try {
    return useQueryClient();
  } catch {
    return fallback;
  }
};

const useSafeWalletProvider = (): ReturnType<
  typeof useWalletProvider
> | null => {
  try {
    return useWalletProvider();
  } catch {
    return null;
  }
};

const currentSearch = (): string => {
  if (typeof window === 'undefined') {
    return '';
  }

  return window.location.search;
};

const handleStayOnViewedBundle = (): void => {
  return undefined;
};

export function useBundlePage({
  userId,
  walletId,
  router,
  search = currentSearch(),
}: UseBundlePageInput): UseBundlePageResult {
  const fallbackQueryClient = useMemo(() => new QueryClient(), []);
  const queryClient = useSafeQueryClient(fallbackQueryClient);
  const { userInfo, isConnected, connectedWallet, loading } = useUser();
  const walletContext = useSafeWalletProvider();
  const connectedWallets =
    walletContext?.connectedWallets ?? EMPTY_CONNECTED_WALLETS;
  const switchActiveWallet =
    walletContext?.switchActiveWallet ?? noopSwitchActiveWallet;
  const [bundleUser, setBundleUser] = useState<BundleUser | null>(null);
  const [bundleNotFound, setBundleNotFound] = useState(false);
  const [emailBannerDismissed, setEmailBannerDismissed] = useState(false);
  const [isWalletManagerOpen, setIsWalletManagerOpen] = useState(false);

  useEffect(() => {
    if (
      !shouldAttemptAutoSwitch(walletId, isConnected, userInfo?.userId, userId)
    ) {
      return;
    }

    const targetWallet = findWalletByAddress(connectedWallets, walletId);
    if (!targetWallet || targetWallet.isActive) {
      return;
    }

    void performWalletSwitchAndRefresh(
      walletId,
      switchActiveWallet,
      queryClient,
    );
  }, [
    connectedWallets,
    isConnected,
    queryClient,
    switchActiveWallet,
    userId,
    userInfo?.userId,
    walletId,
  ]);

  useEffect(() => {
    if (!userId) {
      setBundleNotFound(true);
      return;
    }

    setBundleUser(getBundleUser(userId));
    setBundleNotFound(false);
  }, [userId]);

  useEffect(() => {
    if (
      !shouldRedirectDisconnectedOwner(isConnected, userInfo?.userId, userId)
    ) {
      return;
    }

    router.replace(computeRedirectUrl(search));
  }, [connectedWallet, isConnected, router, search, userId, userInfo?.userId]);

  const handleSwitchToMyBundle = useCallback((): void => {
    if (!userInfo?.userId) {
      return;
    }

    const params = buildUserBundleParams(search, userInfo);
    router.replace(buildBundlePageUrl(params));
  }, [router, search, userInfo]);

  const openWalletManager = useCallback((): void => {
    setIsWalletManagerOpen(true);
  }, []);

  const closeWalletManager = useCallback((): void => {
    setIsWalletManagerOpen(false);
  }, []);

  const handleDismissEmailBanner = useCallback((): void => {
    setEmailBannerDismissed(true);
  }, []);

  const isOwnBundle = isBundleOwned(userId, userInfo?.userId);

  return {
    isOwnBundle,
    bundleUrl: generateBundleUrl(userId),
    bundleUser,
    bundleNotFound,
    showConnectCTA: !isConnected,
    switchPrompt: {
      show:
        !loading &&
        computeIsDifferentUser(isConnected, userInfo?.userId, userId),
      onStay: handleStayOnViewedBundle,
      onSwitch: handleSwitchToMyBundle,
    },
    emailBanner: {
      show: computeShowEmailBanner(
        isConnected,
        isOwnBundle,
        userInfo?.email,
        emailBannerDismissed,
      ),
      onSubscribe: openWalletManager,
      onDismiss: handleDismissEmailBanner,
    },
    overlays: {
      showQuickSwitch: computeShowQuickSwitch(
        isConnected,
        isOwnBundle,
        userInfo?.userId,
      ),
      isWalletManagerOpen,
      openWalletManager,
      closeWalletManager,
      onEmailSubscribed: handleDismissEmailBanner,
    },
  };
}
