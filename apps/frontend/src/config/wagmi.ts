import { createConfig, http } from 'wagmi';
import { arbitrum, base, optimism } from 'wagmi/chains';
import { injected } from 'wagmi/connectors';

export const wagmiConfig = createConfig({
  ssr: true,
  chains: [arbitrum, base, optimism],
  connectors: [injected()],
  transports: {
    [arbitrum.id]: http('https://arb1.arbitrum.io/rpc'),
    [base.id]: http('https://mainnet.base.org'),
    [optimism.id]: http('https://mainnet.optimism.io'),
  },
});
