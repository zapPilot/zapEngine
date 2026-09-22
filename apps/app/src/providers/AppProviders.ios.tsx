import { PrivyElements } from '@privy-io/expo/ui';
import * as SplashScreen from 'expo-splash-screen';

import { createAppProviders } from '@/providers/AppProviderShell';
import { MobilePrivyProvider } from '@/providers/MobilePrivyProvider';

void SplashScreen.preventAutoHideAsync();

// iOS ships podcast + read-only portfolio analytics. It intentionally skips
// WalletProvider (viem createWalletClient, useEmbeddedEthereumWallet,
// useAtomicBatchExecution, SimulationPreviewSheet) and supportedChains so the
// signing/execution backend stays outside the iOS bundle. Privy is used for
// authentication and reading linked-account metadata only.
export const AppProviders = createAppProviders({
  requiresMobilePrivy: true,
  missingConfigTarget: 'iOS podcast flow',
  onReady: () => {
    void SplashScreen.hideAsync();
  },
  renderWalletProviders: (content, privy) => (
    <MobilePrivyProvider appId={privy.appId} clientId={privy.clientId}>
      <PrivyElements
        config={{
          appearance: {
            colorScheme: 'dark',
            accentColor: '#d4c5a3',
          },
        }}
      />
      {content}
    </MobilePrivyProvider>
  ),
});
