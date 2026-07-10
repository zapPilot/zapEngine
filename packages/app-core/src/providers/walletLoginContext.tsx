import type { WalletConnectorOption } from '@core/types';
import {
  createContext,
  type ReactElement,
  type ReactNode,
  useContext,
} from 'react';

/**
 * Connection-method seam for the custom "choose how to connect" picker
 * (web/desktop only — native connects straight to Privy with no picker).
 * `WalletProvider` builds this value from both backends it runs internally;
 * the picker UI never touches wagmi or Privy hooks directly.
 */
export interface WalletLoginContextValue {
  isPickerOpen: boolean;
  openPicker(): void;
  closePicker(): void;
  /** Discovered wallets (injected + the generic WalletConnect entry). */
  connectors: WalletConnectorOption[];
  connectInjected(connectorId: string): Promise<void>;
  connectWalletConnect(): Promise<void>;
  connectPrivy(): Promise<void>;
  /** id of the option currently connecting, or `null`. One of `connectors[].id`, `'privy'`, or `'walletconnect'`. */
  connectingId: string | null;
  isConnecting: boolean;
  isWalletConnectAvailable: boolean;
  error: { message: string; code?: string } | null;
  clearError(): void;
  activeMethod: 'privy' | 'wagmi' | null;
}

const WalletLoginContext = createContext<WalletLoginContextValue | null>(null);

export function WalletLoginProvider({
  value,
  children,
}: {
  value: WalletLoginContextValue;
  children: ReactNode;
}): ReactElement {
  return (
    <WalletLoginContext.Provider value={value}>
      {children}
    </WalletLoginContext.Provider>
  );
}

export function useWalletLogin(): WalletLoginContextValue {
  const context = useContext(WalletLoginContext);
  if (!context) {
    throw new Error('useWalletLogin must be used within a WalletProvider');
  }
  return context;
}
