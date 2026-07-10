import { usePrivyWalletBackend } from '@core/hooks/wallet/usePrivyWalletBackend';
import { useWagmiWalletBackend } from '@core/hooks/wallet/useWagmiWalletBackend';
import { WalletProviderBase } from '@core/providers/walletContext';
import {
  type WalletLoginContextValue,
  WalletLoginProvider,
} from '@core/providers/walletLoginContext';
import type { WalletProviderInterface } from '@core/types';
import {
  type ReactElement,
  type ReactNode,
  useCallback,
  useMemo,
  useState,
} from 'react';

export { useWalletProvider } from '@core/providers/walletContext';
export { useWalletLogin } from '@core/providers/walletLoginContext';

type WalletBackend = ReturnType<typeof usePrivyWalletBackend>;

/**
 * Props the provider hands to a simulation-preview renderer. The web frontend
 * injects its `TenderlyPreviewModal`; the desktop app can inject its own or
 * omit it. Keeping the modal injected (rather than imported here) is what lets
 * this provider live in `@zapengine/app-core` without a UI-component dependency.
 * Always bound to the Privy backend — the wagmi path never produces a
 * simulation preview (external wallets show their own confirmation UI).
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

interface WalletProviderProps {
  children: ReactNode;
  /** Optional renderer for the batch-simulation preview modal. */
  renderSimulationPreview?: (props: SimulationPreviewRenderProps) => ReactNode;
}

/**
 * Unified wallet provider — runs the wagmi (external wallet) and Privy
 * (embedded wallet) backends side by side behind a single
 * `useWalletProvider()` adapter, so the rest of the app never imports either
 * SDK directly. Mounted after `PrivyAuthProvider` and `Web3Provider` (which
 * supply the `PrivyProvider`/`WagmiProvider` ancestors).
 *
 * Active backend: an externally connected wagmi wallet wins over Privy (a
 * user who connected Rabby/Ambire is deliberately not using the embedded
 * wallet); otherwise an authenticated Privy session; otherwise the
 * disconnected wagmi backend as a neutral default. The exposed `connect()` is
 * always overridden to open the custom picker (`useWalletLogin().openPicker`)
 * — screens keep calling `useWalletProvider().connect()` unchanged, and on
 * web/desktop that now shows the wallet-or-Privy choice instead of jumping
 * straight into Privy.
 */
export function WalletProvider({
  children,
  renderSimulationPreview,
}: WalletProviderProps): ReactElement {
  const wagmi = useWagmiWalletBackend();
  const privy = usePrivyWalletBackend();
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [connectingId, setConnectingId] = useState<string | null>(null);

  const openPicker = useCallback(() => setIsPickerOpen(true), []);
  const closePicker = useCallback(() => setIsPickerOpen(false), []);

  const connectPrivy = useCallback(async (): Promise<void> => {
    setConnectingId('privy');
    try {
      await privy.backend.connect();
    } finally {
      setConnectingId(null);
    }
  }, [privy.backend]);

  const connectInjected = useCallback(
    async (connectorId: string): Promise<void> => {
      setConnectingId(connectorId);
      try {
        await wagmi.connectInjected(connectorId);
      } finally {
        setConnectingId(null);
      }
    },
    [wagmi],
  );

  const connectWalletConnect = useCallback(async (): Promise<void> => {
    setConnectingId('walletconnect');
    try {
      await wagmi.connectWalletConnect();
    } finally {
      setConnectingId(null);
    }
  }, [wagmi]);

  const activeMethod: WalletLoginContextValue['activeMethod'] =
    wagmi.isConnected ? 'wagmi' : privy.isActive ? 'privy' : null;

  const activeBackend: WalletProviderInterface = wagmi.isConnected
    ? wagmi.backend
    : privy.isActive
      ? privy.backend
      : wagmi.backend;

  /**
   * Disconnects both backends. wagmi and Privy are independent sessions — a
   * user can be Privy-authenticated *and* have connected an external wallet.
   * Clearing only the active one would let the other silently take over as
   * active on the next render (e.g. disconnecting a wagmi wallet while a
   * Privy session is still live would flip the app back to "connected").
   */
  const disconnectAll = useCallback(async (): Promise<void> => {
    await Promise.all([
      wagmi.isConnected ? wagmi.backend.disconnect() : Promise.resolve(),
      privy.isActive ? privy.backend.disconnect() : Promise.resolve(),
    ]);
  }, [wagmi, privy]);

  const connectViaPicker = useCallback(async (): Promise<void> => {
    openPicker();
  }, [openPicker]);

  const exposedBackend = useMemo<WalletProviderInterface>(
    () => ({
      ...activeBackend,
      connect: connectViaPicker,
      disconnect: disconnectAll,
    }),
    [activeBackend, connectViaPicker, disconnectAll],
  );

  const loginValue = useMemo<WalletLoginContextValue>(
    () => ({
      isPickerOpen,
      openPicker,
      closePicker,
      connectors: wagmi.connectors,
      connectInjected,
      connectWalletConnect,
      connectPrivy,
      connectingId,
      isConnecting:
        connectingId !== null ||
        wagmi.backend.isConnecting ||
        privy.backend.isConnecting,
      isWalletConnectAvailable: wagmi.isWalletConnectAvailable,
      error: activeBackend.error,
      clearError: activeBackend.clearError,
      activeMethod,
    }),
    [
      isPickerOpen,
      openPicker,
      closePicker,
      wagmi.connectors,
      connectInjected,
      connectWalletConnect,
      connectPrivy,
      connectingId,
      wagmi.backend.isConnecting,
      privy.backend.isConnecting,
      wagmi.isWalletConnectAvailable,
      activeBackend.error,
      activeBackend.clearError,
      activeMethod,
    ],
  );

  return (
    <WalletLoginProvider value={loginValue}>
      <WalletProviderBase value={exposedBackend}>
        {children}
        {privy.simulationPreview &&
          renderSimulationPreview?.({
            isOpen: !!privy.simulationPreview,
            onClose: privy.cancelBatchExecution,
            previewData: privy.simulationPreview,
            onConfirm: privy.confirmBatchExecution,
            onRetry: privy.retryBatchSimulation,
            onUpdateApproval: privy.updateApprovalAmount,
            isSigningAndSending: privy.isSigningAndSending,
            batchExecutionPhase: privy.batchExecutionPhase,
            isRetryingSimulation: privy.isRetryingSimulation,
            retryError: privy.retryError,
          })}
      </WalletProviderBase>
    </WalletLoginProvider>
  );
}
