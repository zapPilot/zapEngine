import type { ReactNode } from 'react';

import { ErrorBoundary } from '@/components/errors/ErrorBoundary';
import { GlobalErrorHandler } from '@/components/errors/GlobalErrorHandler';
import { isPrivyEnabled } from '@/lib/env/privy';
import { getRuntimeEnv, isRuntimeMode } from '@/lib/env/runtimeEnv';
import { lazyImport } from '@/lib/lazy/lazyImport';
import { PrivyAuthProvider } from '@/providers/PrivyAuthProvider';
import { QueryProvider } from '@/providers/QueryProvider';
import { SimpleWeb3Provider } from '@/providers/SimpleWeb3Provider';
import {
  UnifiedWalletProvider,
  WalletProvider,
} from '@/providers/WalletProvider';

const DeferredToastProvider = lazyImport(
  async () => import('@/providers/ToastProvider'),
  (mod) => mod.ToastProvider,
);

const shouldLoadLogViewer =
  isRuntimeMode('development') &&
  getRuntimeEnv('VITE_ENABLE_LOG_VIEWER') === '1';

const LogViewer = shouldLoadLogViewer
  ? lazyImport(
      async () => import('@/components/debug/LogViewer'),
      (mod) => mod.LogViewer,
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
 *
 * When a Privy App ID is configured, the tree mounts `PrivyAuthProvider` and the
 * `UnifiedWalletProvider` (wagmi + Privy embedded wallet behind one
 * `useWalletProvider()`). Without it, the original RainbowKit-only
 * `WalletProvider` is used so the app still boots.
 */
export function BundleProviders({ children }: BundleProvidersProps) {
  const inner = (
    <ErrorBoundary resetKeys={['user-context']}>
      <GlobalErrorHandler />
      <DeferredToastProvider>{children}</DeferredToastProvider>
      <LogViewer />
    </ErrorBoundary>
  );

  return (
    <QueryProvider>
      {isPrivyEnabled() ? (
        <PrivyAuthProvider>
          <SimpleWeb3Provider>
            <UnifiedWalletProvider>{inner}</UnifiedWalletProvider>
          </SimpleWeb3Provider>
        </PrivyAuthProvider>
      ) : (
        <SimpleWeb3Provider>
          <WalletProvider>{inner}</WalletProvider>
        </SimpleWeb3Provider>
      )}
    </QueryProvider>
  );
}
