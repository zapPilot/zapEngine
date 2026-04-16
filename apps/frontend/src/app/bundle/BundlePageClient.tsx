import { useEffect } from "react";

import { QuickSwitchFAB } from "@/components/bundle";
import { EmailReminderBanner } from "@/components/layout/banners/EmailReminderBanner";
import { SwitchPromptBanner } from "@/components/layout/banners/SwitchPromptBanner";
import { DashboardShell } from "@/components/wallet/portfolio/DashboardShell";
import { useUser } from "@/contexts/UserContext";
import { useBundlePage } from "@/hooks/bundle/useBundlePage";
import { lazyImport } from "@/lib/lazy/lazyImport";
import {
  useAppPathname,
  useAppRouter,
  useAppSearchParams,
} from "@/lib/routing";

const LazyWalletManager = lazyImport(
  async () => import("@/components/WalletManager"),
  mod => mod.WalletManager
);

interface BundlePageClientProps {
  userId: string;
  walletId?: string;
  etlJobId?: string;
  isNewUser?: boolean;
}

export function BundlePageClient({
  userId,
  walletId,
  etlJobId,
  isNewUser,
}: BundlePageClientProps) {
  const router = useAppRouter();
  const pathname = useAppPathname();
  const searchParams = useAppSearchParams();
  const { userInfo, isConnected, loading } = useUser();
  const vm = useBundlePage(userId, walletId);

  useEffect(() => {
    if (loading) {
      return;
    }

    const shouldRedirectToUserBundle =
      isConnected && userInfo?.userId && !userId && pathname === "/";
    if (shouldRedirectToUserBundle) {
      const current = new URLSearchParams(Array.from(searchParams.entries()));
      current.set("userId", userInfo.userId);
      if (userInfo.etlJobId) {
        current.set("etlJobId", userInfo.etlJobId);
      }
      const queryString = current.toString();
      const newUrl = `/bundle?${queryString}`;
      router.replace(newUrl);
    }
  }, [
    isConnected,
    loading,
    userInfo?.userId,
    userInfo?.etlJobId,
    userId,
    router,
    pathname,
    searchParams,
  ]);

  useEffect(() => {
    const sanitizeInlineScripts = () => {
      const scripts = document.querySelectorAll("body script");
      for (const script of scripts) {
        if (!script.textContent) continue;
        if (/@[^@\s]+\.[^@\s]+/.test(script.textContent)) {
          script.textContent = "";
        }
      }
    };

    sanitizeInlineScripts();

    const observer = new MutationObserver(() => sanitizeInlineScripts());
    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, []);

  return (
    <DashboardShell
      urlUserId={userId}
      initialEtlJobId={etlJobId}
      isNewUser={isNewUser}
      isOwnBundle={vm.isOwnBundle}
      bundleUrl={vm.bundleUrl}
      headerBanners={
        <>
          <SwitchPromptBanner
            show={vm.switchPrompt.show}
            bundleUserName={vm.bundleUser?.displayName}
            onSwitch={vm.switchPrompt.onSwitch}
          />
          {vm.emailBanner.show && (
            <EmailReminderBanner
              onSubscribe={vm.emailBanner.onSubscribe}
              onDismiss={vm.emailBanner.onDismiss}
            />
          )}
        </>
      }
      footerOverlays={
        <>
          {vm.overlays.showQuickSwitch && (
            <QuickSwitchFAB onSwitchToMyBundle={vm.switchPrompt.onSwitch} />
          )}
          <LazyWalletManager
            isOpen={vm.overlays.isWalletManagerOpen}
            onClose={vm.overlays.closeWalletManager}
            onEmailSubscribed={vm.overlays.onEmailSubscribed}
            {...(userId ? { urlUserId: userId } : {})}
          />
        </>
      }
      {...(vm.bundleUser?.displayName
        ? { bundleUserName: vm.bundleUser.displayName }
        : {})}
    />
  );
}
