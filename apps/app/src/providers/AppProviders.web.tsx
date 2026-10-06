import { AccountSessionBridge } from '@/providers/AccountSessionBridge';
import { createAppProviders } from '@/providers/AppProviderShell';
import { WalletProvider } from '@/providers/WalletProvider';

export const AppProviders = createAppProviders({
  renderAccountSessionBridge: () => <AccountSessionBridge />,
  requiresMobilePrivy: false,
  renderWalletProviders: (content) => (
    <WalletProvider>{content}</WalletProvider>
  ),
});
