import {
  createContext,
  type ReactElement,
  type ReactNode,
  useContext,
  useMemo,
} from 'react';

import { TenderlyPreviewModal } from '@/components/wallet/portfolio/modals/TenderlyPreviewModal';
import { usePrivyWalletBackend } from '@/hooks/wallet/usePrivyWalletBackend';
import type { WalletProviderInterface } from '@/types';

type WalletContextValue = WalletProviderInterface;

const WalletContext = createContext<WalletContextValue | null>(null);

interface WalletProviderProps {
  children: ReactNode;
}

/**
 * Privy-only wallet provider.
 *
 * Wraps the Privy embedded-wallet backend behind a single
 * `useWalletProvider()` adapter so the rest of the app never imports Privy
 * directly. The provider is mounted by `BundleProviders` after
 * `PrivyAuthProvider` (which supplies the `PrivyProvider` and requires
 * `VITE_PRIVY_APP_ID`).
 */
export function WalletProvider({
  children,
}: WalletProviderProps): ReactElement {
  const {
    backend,
    simulationPreview,
    confirmBatchExecution,
    retryBatchSimulation,
    updateApprovalAmount,
    cancelBatchExecution,
    isSigningAndSending,
    isRetryingSimulation,
    retryError,
  } = usePrivyWalletBackend();

  const value = useMemo<WalletContextValue>(() => backend, [backend]);

  return (
    <WalletContext.Provider value={value}>
      {children}
      {simulationPreview && (
        <TenderlyPreviewModal
          isOpen={!!simulationPreview}
          onClose={cancelBatchExecution}
          previewData={simulationPreview}
          onConfirm={confirmBatchExecution}
          onRetry={retryBatchSimulation}
          onUpdateApproval={updateApprovalAmount}
          isSigningAndSending={isSigningAndSending}
          isRetryingSimulation={isRetryingSimulation}
          retryError={retryError}
        />
      )}
    </WalletContext.Provider>
  );
}

export function useWalletProvider(): WalletProviderInterface {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWalletProvider must be used within a WalletProvider');
  }
  return context;
}
