import type { SimulationPreviewRenderProps } from '@core/hooks/wallet/useAtomicBatchExecution';
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

/**
 * Render props for the injected simulation-preview UI — defined next to the
 * RN-safe `useAtomicBatchExecution` hook so native hosts can import the type
 * without touching this web-only provider. Keeping the renderer injected
 * (rather than imported here) is what lets this provider live in
 * `@zapengine/app-core` without a UI-component dependency.
 */
export type { SimulationPreviewRenderProps } from '@core/hooks/wallet/useAtomicBatchExecution';

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
 * Active backend: an externally connected wagmi wallet wins over Privy;
 * otherwise an authenticated Privy session; otherwise the disconnected wagmi
 * backend as a neutral default. The exposed `connect()` is always overridden
 * to open the custom picker (`useWalletLogin().openPicker`) — screens keep
 * calling `useWalletProvider().connect()` unchanged, and on web/desktop that
 * now shows the wallet-or-Privy choice instead of jumping straight into Privy.
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
        const connected = await wagmi.connectInjected(connectorId);
        if (connected) {
          closePicker();
        }
      } finally {
        setConnectingId(null);
      }
    },
    [closePicker, wagmi],
  );

  const activeBackend: WalletProviderInterface = wagmi.isConnected
    ? wagmi.backend
    : privy.isActive
      ? privy.backend
      : wagmi.backend;
  // Only user-initiated attempts (picker selections) surface as busy. Backend
  // bootstrap states — wagmi's auto-reconnect sweep, Privy hydration — must
  // stay internal: with several extensions installed, one that never answers
  // wagmi's startup probe keeps that sweep pending forever, and surfacing it
  // here would disable the connect UI indefinitely.
  const isConnecting = connectingId !== null;

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
      isConnecting,
    }),
    [activeBackend, connectViaPicker, disconnectAll, isConnecting],
  );

  const loginValue = useMemo<WalletLoginContextValue>(
    () => ({
      isPickerOpen,
      openPicker,
      closePicker,
      connectors: wagmi.connectors,
      connectInjected,
      connectPrivy,
      connectingId,
      isConnecting,
      // The picker may fail on the non-active backend (e.g. a Privy login
      // error while wagmi is the neutral default), so surface whichever
      // backend holds an error.
      error: wagmi.backend.error ?? privy.backend.error,
    }),
    [
      isPickerOpen,
      openPicker,
      closePicker,
      wagmi.connectors,
      connectInjected,
      connectPrivy,
      connectingId,
      isConnecting,
      wagmi.backend.error,
      privy.backend.error,
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
