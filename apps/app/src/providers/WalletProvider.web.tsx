import { PrivyAuthProvider } from '@zapengine/app-core/providers/PrivyAuthProvider';
import { WalletProvider as AppCoreWalletProvider } from '@zapengine/app-core/providers/WalletProvider';
import { Web3Provider } from '@zapengine/app-core/providers/Web3Provider';
import type { ReactElement, ReactNode } from 'react';

interface WalletProviderProps {
  children: ReactNode;
}

export function WalletProvider({
  children,
}: WalletProviderProps): ReactElement {
  return (
    <Web3Provider>
      <PrivyAuthProvider>
        <AppCoreWalletProvider>{children}</AppCoreWalletProvider>
      </PrivyAuthProvider>
    </Web3Provider>
  );
}
