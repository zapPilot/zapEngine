import { createAppProviders } from '@/providers/AppProviderShell';
import { WalletProvider } from '@/providers/WalletProvider';

export const AppProviders = createAppProviders({
  requiresMobilePrivy: false,
  renderWalletProviders: (content) => (
    <WalletProvider>{content}</WalletProvider>
  ),
});
