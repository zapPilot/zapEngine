import { PrivyAuthProvider } from '@zapengine/app-core/providers/PrivyAuthProvider';
import { WalletProvider as AppCoreWalletProvider } from '@zapengine/app-core/providers/WalletProvider';
import type { ReactElement, ReactNode } from 'react';

interface WalletProviderProps {
  children: ReactNode;
}

export function WalletProvider({
  children,
}: WalletProviderProps): ReactElement {
  return (
    <PrivyAuthProvider>
      <AppCoreWalletProvider>{children}</AppCoreWalletProvider>
    </PrivyAuthProvider>
  );
}
