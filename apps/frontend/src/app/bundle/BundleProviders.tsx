import { isPrivyEnabled } from '@zapengine/app-core/lib/env/privy';
import {
  getRuntimeEnv,
  isRuntimeMode,
} from '@zapengine/app-core/lib/env/runtimeEnv';
import { PrivyAuthProvider } from '@zapengine/app-core/providers/PrivyAuthProvider';
import { QueryProvider } from '@zapengine/app-core/providers/QueryProvider';
import { WalletProvider } from '@zapengine/app-core/providers/WalletProvider';
import type { ReactNode } from 'react';

import { ErrorBoundary } from '@/components/errors/ErrorBoundary';
import { GlobalErrorHandler } from '@/components/errors/GlobalErrorHandler';
import { TenderlyPreviewModal } from '@/components/wallet/portfolio/modals/TenderlyPreviewModal';
import { lazyImport } from '@/lib/lazy/lazyImport';

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
 * Privy is the only wallet backend. `PrivyAuthProvider` throws when
 * `VITE_PRIVY_APP_ID` is missing; we surface that requirement via
 * `isPrivyEnabled()` at the route entry so unit tests can stub the chain.
 */
export function BundleProviders({ children }: BundleProvidersProps) {
  const inner = (
    <ErrorBoundary resetKeys={['user-context']}>
      <GlobalErrorHandler />
      <DeferredToastProvider>{children}</DeferredToastProvider>
      <LogViewer />
    </ErrorBoundary>
  );

  if (!isPrivyEnabled()) {
    throw new Error(
      'Missing required VITE_PRIVY_APP_ID for Privy wallet configuration.',
    );
  }

  return (
    <QueryProvider>
      <PrivyAuthProvider>
        <WalletProvider
          renderSimulationPreview={(previewProps) => (
            <TenderlyPreviewModal {...previewProps} />
          )}
        >
          {inner}
        </WalletProvider>
      </PrivyAuthProvider>
    </QueryProvider>
  );
}
