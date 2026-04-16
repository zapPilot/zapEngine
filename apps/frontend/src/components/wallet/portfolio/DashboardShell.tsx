import { useQueryClient } from "@tanstack/react-query";
import { type ReactElement, type ReactNode } from "react";

import { createEmptyPortfolioState } from "@/adapters/walletPortfolioDataAdapter";
import { WalletPortfolioErrorState } from "@/components/wallet/portfolio/views/LoadingStates";
import { WalletPortfolioPresenter } from "@/components/wallet/portfolio/WalletPortfolioPresenter";
import { usePortfolioDataProgressive } from "@/hooks/queries/analytics/usePortfolioDataProgressive";
import { useEtlJobPolling, useEtlJobSync } from "@/hooks/wallet";
import { useAppRouter } from "@/lib/routing";
import { logger } from "@/utils";

interface DashboardShellProps {
  urlUserId: string;
  isOwnBundle: boolean;
  bundleUserName?: string;
  bundleUrl?: string;
  headerBanners?: ReactNode;
  footerOverlays?: ReactNode;
  initialEtlJobId?: string | undefined;
  isNewUser?: boolean | undefined;
}

type EtlState = ReturnType<typeof useEtlJobPolling>["state"];
type UnifiedPortfolioSnapshot = { positions?: number; balance?: number } | null;

function getSafeError(error: Error | null | unknown): Error | null {
  return error instanceof Error ? error : null;
}

function computeIsEmptyState(
  isLoading: boolean,
  unifiedData: UnifiedPortfolioSnapshot
): boolean {
  return Boolean(
    !isLoading &&
    (unifiedData === null ||
      ((unifiedData.positions ?? 0) === 0 && (unifiedData.balance ?? 0) === 0))
  );
}

function logDashboardState(
  unifiedData: UnifiedPortfolioSnapshot,
  isLoading: boolean,
  error: Error | null
): void {
  logger.debug("[DashboardShell] Debug State:", {
    unifiedData: unifiedData ? "exists" : "null",
    balance: unifiedData?.balance ?? "N/A",
    positions: unifiedData?.positions ?? "N/A",
    isLoading,
    error: error ? error.message : null,
  });
}

interface DashboardShellViewProps {
  urlUserId: string;
  isOwnBundle: boolean;
  bundleUserName: string | undefined;
  bundleUrl: string | undefined;
  portfolioData: ReturnType<typeof createEmptyPortfolioState>;
  sections: ReturnType<typeof usePortfolioDataProgressive>["sections"];
  isEmptyState: boolean;
  isLoading: boolean;
  etlState: EtlState;
  headerBanners?: ReactNode;
  footerOverlays?: ReactNode;
}

function DashboardShellView({
  urlUserId,
  isOwnBundle,
  bundleUserName,
  bundleUrl,
  portfolioData,
  sections,
  isEmptyState,
  isLoading,
  etlState,
  headerBanners,
  footerOverlays,
}: DashboardShellViewProps): ReactElement {
  return (
    <div
      data-bundle-user-id={urlUserId}
      data-bundle-owner={isOwnBundle ? "own" : "visitor"}
      data-bundle-user-name={bundleUserName ?? ""}
      data-bundle-url={bundleUrl ?? ""}
    >
      <WalletPortfolioPresenter
        data={portfolioData}
        sections={sections}
        userId={urlUserId}
        isOwnBundle={isOwnBundle}
        isEmptyState={isEmptyState}
        isLoading={isLoading}
        etlState={etlState}
        headerBanners={headerBanners}
        footerOverlays={footerOverlays}
      />
    </div>
  );
}

export function DashboardShell({
  urlUserId,
  isOwnBundle,
  bundleUserName,
  bundleUrl,
  headerBanners,
  footerOverlays,
  initialEtlJobId,
}: DashboardShellProps): ReactElement {
  const router = useAppRouter();
  const queryClient = useQueryClient();

  const {
    state: etlState,
    startPolling,
    completeTransition,
  } = useEtlJobPolling();

  const {
    unifiedData,
    sections,
    sentimentData,
    regimeHistoryData,
    isLoading,
    error,
    refetch,
  } = usePortfolioDataProgressive(urlUserId, etlState.isInProgress);

  useEtlJobSync({
    initialEtlJobId,
    etlState,
    startPolling,
    completeTransition,
    urlUserId,
    refetch,
    queryClient,
    router,
  });

  const safeError = getSafeError(error);

  if (safeError && !unifiedData) {
    return <WalletPortfolioErrorState error={safeError} onRetry={refetch} />;
  }

  logDashboardState(unifiedData, isLoading, safeError);
  const isEmptyState = computeIsEmptyState(isLoading, unifiedData);
  const portfolioData =
    unifiedData ??
    createEmptyPortfolioState(sentimentData ?? null, regimeHistoryData ?? null);

  return (
    <DashboardShellView
      urlUserId={urlUserId}
      isOwnBundle={isOwnBundle}
      bundleUserName={bundleUserName}
      bundleUrl={bundleUrl}
      portfolioData={portfolioData}
      sections={sections}
      isEmptyState={isEmptyState}
      isLoading={isLoading}
      etlState={etlState}
      headerBanners={headerBanners}
      footerOverlays={footerOverlays}
    />
  );
}
