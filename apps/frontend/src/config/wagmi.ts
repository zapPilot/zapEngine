import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { http } from 'wagmi';
import { arbitrum, base, optimism } from 'wagmi/chains';

import { getRuntimeEnv } from '@/lib/env/runtimeEnv';

const walletConnectProjectId = getRuntimeEnv(
  'VITE_WALLETCONNECT_PROJECT_ID',
)?.trim();

if (!walletConnectProjectId) {
  throw new Error(
    'Missing required VITE_WALLETCONNECT_PROJECT_ID for RainbowKit WalletConnect configuration.',
  );
}

export const wagmiConfig = getDefaultConfig({
  appName: 'Zap Pilot',
  projectId: walletConnectProjectId,
  chains: [arbitrum, base, optimism],
  ssr: true,
  transports: {
    [arbitrum.id]: http('https://arb1.arbitrum.io/rpc'),
    [base.id]: http('https://mainnet.base.org'),
    [optimism.id]: http('https://mainnet.optimism.io'),
  },
});
