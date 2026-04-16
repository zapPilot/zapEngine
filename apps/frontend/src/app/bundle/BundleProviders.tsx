import type { ReactNode } from "react";

import { ErrorBoundary } from "@/components/errors/ErrorBoundary";
import { GlobalErrorHandler } from "@/components/errors/GlobalErrorHandler";
import { UserProvider } from "@/contexts/UserContext";
import { getRuntimeEnv, isRuntimeMode } from "@/lib/env/runtimeEnv";
import { lazyImport } from "@/lib/lazy/lazyImport";
import { QueryProvider } from "@/providers/QueryProvider";
import { SimpleWeb3Provider } from "@/providers/SimpleWeb3Provider";
import { ToastProvider } from "@/providers/ToastProvider";
import { WalletProvider } from "@/providers/WalletProvider";

const shouldLoadLogViewer =
  isRuntimeMode("development") &&
  getRuntimeEnv("VITE_ENABLE_LOG_VIEWER") === "1";

const LogViewer = shouldLoadLogViewer
  ? lazyImport(
      async () => import("@/components/debug/LogViewer"),
      mod => mod.LogViewer
    )
  : () => null;

interface BundleProvidersProps {
  children: ReactNode;
}

/**
 * Route-scoped providers for bundle pages.
 *
 * Keeping wallet/query providers out of the root layout reduces the amount of
 * app state pulled into the initial SPA shell during development.
 */
export function BundleProviders({ children }: BundleProvidersProps) {
  return (
    <QueryProvider>
      <SimpleWeb3Provider>
        <WalletProvider>
          <UserProvider>
            <ErrorBoundary resetKeys={["user-context"]}>
              <GlobalErrorHandler />
              <ToastProvider>{children}</ToastProvider>
              <LogViewer />
            </ErrorBoundary>
          </UserProvider>
        </WalletProvider>
      </SimpleWeb3Provider>
    </QueryProvider>
  );
}
