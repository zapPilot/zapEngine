import type { PrivyProviderProps } from '@privy-io/expo';
import { PrivyElements } from '@privy-io/expo/ui';
import * as SplashScreen from 'expo-splash-screen';

import { NATIVE_WALLET_SUPPORTED_CHAINS } from '@/integration/walletBackendModel';
import { createAppProviders } from '@/providers/AppProviderShell';
import {
  MobilePrivyProvider,
  WalletProvider,
} from '@/providers/WalletProvider';

void SplashScreen.preventAutoHideAsync();

const PRIVY_SUPPORTED_CHAINS = NATIVE_WALLET_SUPPORTED_CHAINS as NonNullable<
  PrivyProviderProps['supportedChains']
>;

export const AppProviders = createAppProviders({
  missingConfigTarget: 'native wallet flow',
  onReady: () => {
    void SplashScreen.hideAsync();
  },
  renderWalletProviders: (content, privy) => (
    <MobilePrivyProvider
      appId={privy.appId}
      clientId={privy.clientId}
      supportedChains={PRIVY_SUPPORTED_CHAINS}
    >
      <PrivyElements
        config={{
          appearance: {
            colorScheme: 'dark',
            accentColor: '#d4c5a3',
          },
        }}
      />
      <WalletProvider>{content}</WalletProvider>
    </MobilePrivyProvider>
  ),
});
