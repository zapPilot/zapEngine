import { PrivyAuthProvider } from '@zapengine/app-core/providers/PrivyAuthProvider';
import { WalletProvider as AppCoreWalletProvider } from '@zapengine/app-core/providers/WalletProvider';
import { Web3Provider } from '@zapengine/app-core/providers/Web3Provider';
import type { ReactElement, ReactNode } from 'react';

import { SimulationPreviewSheet } from '@/components/invest/simulation/SimulationPreviewSheet';

interface WalletProviderProps {
  children: ReactNode;
}

export function WalletProvider({
  children,
}: WalletProviderProps): ReactElement {
  return (
    <Web3Provider>
      <PrivyAuthProvider>
        <AppCoreWalletProvider
          renderSimulationPreview={(props) => (
            <SimulationPreviewSheet {...props} />
          )}
        >
          {children}
        </AppCoreWalletProvider>
      </PrivyAuthProvider>
    </Web3Provider>
  );
}
