import type { QueryClient } from '@tanstack/react-query';

import { logger } from '@/utils';

export interface ConnectedWalletItem {
  address: string;
  isActive?: boolean;
}

interface UserBundleInfo {
  userId?: string;
  etlJobId?: string | null | undefined;
}

export const EMPTY_CONNECTED_WALLETS: ConnectedWalletItem[] = [];

export const noopSwitchActiveWallet = (): Promise<void> => Promise.resolve();

const invalidateWalletSwitchQueries = async (
  queryClient: QueryClient,
): Promise<void> => {
  await queryClient.invalidateQueries({
    queryKey: ['portfolio'],
  });
  await queryClient.invalidateQueries({
    queryKey: ['wallets'],
  });
};

export const shouldAttemptAutoSwitch = (
  walletId: string | undefined,
  isConnected: boolean,
  currentUserId: string | undefined,
  viewedUserId: string,
): walletId is string =>
  Boolean(walletId && isConnected && currentUserId === viewedUserId);

export const findWalletByAddress = (
  connectedWallets: ConnectedWalletItem[],
  walletId: string,
): ConnectedWalletItem | undefined => {
  const normalizedWalletId = walletId.toLowerCase();

  return connectedWallets.find(
    (walletItem) => walletItem.address.toLowerCase() === normalizedWalletId,
  );
};

export const performWalletSwitchAndRefresh = async (
  walletId: string,
  switchActiveWallet: (walletId: string) => Promise<void>,
  queryClient: QueryClient,
): Promise<void> => {
  try {
    await switchActiveWallet(walletId);
    await invalidateWalletSwitchQueries(queryClient);
    logger.info('Cache invalidated after wallet switch');
  } catch (error) {
    logger.error('Failed to auto-switch wallet:', error);
  }
};

export const buildBundlePageUrl = (searchParams: URLSearchParams): string => {
  const queryString = searchParams.toString();
  if (!queryString) {
    return '/bundle';
  }

  return `/bundle?${queryString}`;
};

export const computeIsDifferentUser = (
  isConnected: boolean,
  currentUserId: string | undefined,
  viewedUserId: string,
): boolean =>
  Boolean(isConnected && currentUserId && currentUserId !== viewedUserId);

export const computeShowQuickSwitch = (
  isConnected: boolean,
  isOwnBundle: boolean,
  currentUserId: string | undefined,
): boolean => Boolean(isConnected && !isOwnBundle && currentUserId);

export const computeShowEmailBanner = (
  isConnected: boolean,
  isOwnBundle: boolean,
  email: string | undefined,
  emailBannerDismissed: boolean,
): boolean =>
  Boolean(isConnected && isOwnBundle && !email && !emailBannerDismissed);

export const computeRedirectUrl = (search: string): string => {
  if (!search) {
    return '/';
  }

  if (search.startsWith('?')) {
    return `/${search}`;
  }

  return `/?${search}`;
};

export const shouldRedirectDisconnectedOwner = (
  isConnected: boolean,
  currentUserId: string | undefined,
  viewedUserId: string,
): boolean => !isConnected && currentUserId === viewedUserId;

export const buildUserBundleParams = (
  search: string,
  userInfo: UserBundleInfo,
): URLSearchParams => {
  const params = new URLSearchParams(search);
  if (!userInfo.userId) {
    return params;
  }

  params.set('userId', userInfo.userId);
  if (userInfo.etlJobId) {
    params.set('etlJobId', userInfo.etlJobId);
  } else {
    params.delete('etlJobId');
  }

  return params;
};
