import { createAppProviders } from '@/providers/AppProviderShell';
import { WalletProvider } from '@/providers/WalletProvider';

export const AppProviders = createAppProviders({
  missingConfigTarget: 'web wallet flow',
  renderWalletProviders: (content) => (
    <WalletProvider>{content}</WalletProvider>
  ),
});
