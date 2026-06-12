import {
  createContext,
  type ReactElement,
  type ReactNode,
  useContext,
  useMemo,
} from 'react';

import { TenderlyPreviewModal } from '@/components/wallet/portfolio/modals/TenderlyPreviewModal';
import { usePrivyWalletBackend } from '@/hooks/wallet/usePrivyWalletBackend';
import { useWagmiWalletBackend } from '@/hooks/wallet/useWagmiWalletBackend';
import type { WalletProviderInterface } from '@/types';

type WalletContextValue = WalletProviderInterface;

const WalletContext = createContext<WalletContextValue | null>(null);

interface WalletProviderProps {
  children: ReactNode;
}

/**
 * RainbowKit/wagmi-only wallet provider.
 *
 * Used when Privy is not configured (no `VITE_PRIVY_APP_ID`) and by any tree
 * that does not mount `PrivyProvider` — its behaviour is identical to the
 * original single-backend provider.
 */
export function WalletProvider({
  children,
}: WalletProviderProps): ReactElement {
  const value = useWagmiWalletBackend();
  return (
    <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
  );
}

/**
 * Unified wallet provider that merges the wagmi backend with the Privy
 * embedded-wallet backend behind a single `useWalletProvider()`.
 *
 * Both backends are always evaluated (their hooks run unconditionally, so both
 * `WagmiProvider` and `PrivyProvider` must be mounted above). The Privy backend
 * takes over once a user is authenticated and an embedded wallet exists;
 * otherwise the wagmi (RainbowKit) backend drives the interface. Downstream
 * consumers see no difference — they keep calling `useWalletProvider()`.
 */
export function UnifiedWalletProvider({
  children,
}: WalletProviderProps): ReactElement {
  const wagmiBackend = useWagmiWalletBackend();
  const {
    backend: privyBackend,
    isActive: isPrivyActive,
    simulationPreview,
    confirmBatchExecution,
    cancelBatchExecution,
    isSigningAndSending,
  } = usePrivyWalletBackend();

  const value = useMemo<WalletContextValue>(
    () => (isPrivyActive ? privyBackend : wagmiBackend),
    [isPrivyActive, privyBackend, wagmiBackend],
  );

  return (
    <WalletContext.Provider value={value}>
      {children}
      {simulationPreview && (
        <TenderlyPreviewModal
          isOpen={!!simulationPreview}
          onClose={cancelBatchExecution}
          previewData={simulationPreview}
          onConfirm={confirmBatchExecution}
          isSigningAndSending={isSigningAndSending}
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
