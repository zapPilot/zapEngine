import type { WalletProviderInterface } from '@core/types';
import {
  createContext,
  type ReactElement,
  type ReactNode,
  useContext,
} from 'react';

/**
 * Platform-agnostic wallet context seam. This module is Privy-free and
 * DOM-free so non-web hosts (e.g. React Native) can supply their own
 * `WalletProviderInterface` implementation via `WalletProviderBase`; the
 * web/desktop `WalletProvider` composes the Privy backend on top of it.
 */
const WalletContext = createContext<WalletProviderInterface | null>(null);

export function WalletProviderBase({
  value,
  children,
}: {
  value: WalletProviderInterface;
  children: ReactNode;
}): ReactElement {
  return (
    <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
  );
}

export function useWalletProvider(): WalletProviderInterface {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWalletProvider must be used within a WalletProvider');
  }
  return context;
}
