import { getWagmiConfig } from '@core/config/wagmi';
import type { ReactElement, ReactNode } from 'react';
import { WagmiProvider } from 'wagmi';

/**
 * External-wallet (wagmi) provider — web + Electron desktop only.
 *
 * Must render inside a `QueryClientProvider` (wagmi v3 requires TanStack
 * Query); `AppProviderShell` mounts one above this on web.
 */
export function Web3Provider({
  children,
}: {
  children: ReactNode;
}): ReactElement {
  return <WagmiProvider config={getWagmiConfig()}>{children}</WagmiProvider>;
}
