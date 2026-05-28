import '@rainbow-me/rainbowkit/styles.css';

import { RainbowKitProvider } from '@rainbow-me/rainbowkit';
import { type ReactNode } from 'react';
import { WagmiProvider } from 'wagmi';

import { wagmiConfig } from '@/config/wagmi';

interface SimpleWeb3ProviderProps {
  children: ReactNode;
}

/**
 * Web3 provider using wagmi for wallet connectivity.
 * Auto-reconnect is handled automatically by wagmi on mount.
 */
export function SimpleWeb3Provider({ children }: SimpleWeb3ProviderProps) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <RainbowKitProvider>{children}</RainbowKitProvider>
    </WagmiProvider>
  );
}
