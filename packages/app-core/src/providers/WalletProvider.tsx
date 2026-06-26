import { usePrivyWalletBackend } from '@core/hooks/wallet/usePrivyWalletBackend';
import type { WalletProviderInterface } from '@core/types';
import {
  createContext,
  type ReactElement,
  type ReactNode,
  useContext,
  useMemo,
} from 'react';

type WalletBackend = ReturnType<typeof usePrivyWalletBackend>;

/**
 * Props the provider hands to a simulation-preview renderer. The web frontend
 * injects its `TenderlyPreviewModal`; the desktop app can inject its own or
 * omit it. Keeping the modal injected (rather than imported here) is what lets
 * this provider live in `@zapengine/app-core` without a UI-component dependency.
 */
export interface SimulationPreviewRenderProps {
  isOpen: boolean;
  onClose: WalletBackend['cancelBatchExecution'];
  previewData: NonNullable<WalletBackend['simulationPreview']>;
  onConfirm: WalletBackend['confirmBatchExecution'];
  onRetry: WalletBackend['retryBatchSimulation'];
  onUpdateApproval: WalletBackend['updateApprovalAmount'];
  isSigningAndSending: WalletBackend['isSigningAndSending'];
  batchExecutionPhase: WalletBackend['batchExecutionPhase'];
  isRetryingSimulation: WalletBackend['isRetryingSimulation'];
  retryError: WalletBackend['retryError'];
}

type WalletContextValue = WalletProviderInterface;

const WalletContext = createContext<WalletContextValue | null>(null);

interface WalletProviderProps {
  children: ReactNode;
  /** Optional renderer for the batch-simulation preview modal. */
  renderSimulationPreview?: (props: SimulationPreviewRenderProps) => ReactNode;
}

/**
 * Privy-only wallet provider.
 *
 * Wraps the Privy embedded-wallet backend behind a single
 * `useWalletProvider()` adapter so the rest of the app never imports Privy
 * directly. Mounted after `PrivyAuthProvider` (which supplies the
 * `PrivyProvider` and requires `VITE_PRIVY_APP_ID`).
 */
export function WalletProvider({
  children,
  renderSimulationPreview,
}: WalletProviderProps): ReactElement {
  const {
    backend,
    simulationPreview,
    confirmBatchExecution,
    retryBatchSimulation,
    updateApprovalAmount,
    cancelBatchExecution,
    isSigningAndSending,
    batchExecutionPhase,
    isRetryingSimulation,
    retryError,
  } = usePrivyWalletBackend();

  const value = useMemo<WalletContextValue>(() => backend, [backend]);

  return (
    <WalletContext.Provider value={value}>
      {children}
      {simulationPreview &&
        renderSimulationPreview?.({
          isOpen: !!simulationPreview,
          onClose: cancelBatchExecution,
          previewData: simulationPreview,
          onConfirm: confirmBatchExecution,
          onRetry: retryBatchSimulation,
          onUpdateApproval: updateApprovalAmount,
          isSigningAndSending,
          batchExecutionPhase,
          isRetryingSimulation,
          retryError,
        })}
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
