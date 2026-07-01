import {
  computeIsDifferentUser,
  computeRedirectUrl,
  computeShowEmailBanner,
  computeShowQuickSwitch,
  useBundlePage as useSharedBundlePage,
} from '@zapengine/app-core/hooks/bundle';

import { useAppRouter } from '@/lib/routing';

export {
  computeIsDifferentUser,
  computeRedirectUrl,
  computeShowEmailBanner,
  computeShowQuickSwitch,
};

export function useBundlePage(userId: string, walletId?: string) {
  const router = useAppRouter();

  return useSharedBundlePage({
    userId,
    ...(walletId ? { walletId } : {}),
    router,
    search: window.location.search,
  });
}
