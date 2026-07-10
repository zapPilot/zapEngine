import { getWalletConnectProjectId } from '@core/lib/env/walletConnect';
import { arbitrum, base, optimism } from 'viem/chains';
import { type Config, createConfig, http } from 'wagmi';
// Import each connector from its own subpath, not the `wagmi/connectors`
// barrel — that barrel re-exports every connector (including `porto`, whose
// `ox` dependency Metro cannot resolve), which would pull the whole set into
// the web/desktop bundle just to use these two.
import { injected } from 'wagmi/connectors/injected';
import { walletConnect } from 'wagmi/connectors/walletConnect';

/**
 * wagmi config for external-wallet login (web + Electron desktop only).
 *
 * `injected()` surfaces one connector per EIP-6963-announced browser
 * extension (Rabby, Ambire, MetaMask, …) — real browsers only. `walletConnect()`
 * is the only external-wallet path on hosts with no browser extensions (the
 * Electron shell), so it is added whenever a project ID is configured; unlike
 * the pre-removal config, a missing project ID does not throw — `injected()`
 * still works in real browsers, it just means desktop has no external-wallet
 * option beyond Privy.
 *
 * Lazily memoized so `createConfig` (which touches storage) never runs at
 * import time, matching the app-core "no module-scope env read" rule.
 */
let cachedConfig: Config | undefined;

export function getWagmiConfig(): Config {
  if (cachedConfig) {
    return cachedConfig;
  }

  const projectId = getWalletConnectProjectId();

  cachedConfig = createConfig({
    chains: [arbitrum, base, optimism],
    connectors: [
      injected(),
      ...(projectId ? [walletConnect({ projectId, showQrModal: true })] : []),
    ],
    transports: {
      [arbitrum.id]: http('https://arb1.arbitrum.io/rpc'),
      [base.id]: http('https://mainnet.base.org'),
      [optimism.id]: http('https://mainnet.optimism.io'),
    },
    ssr: true,
    multiInjectedProviderDiscovery: true,
  });

  return cachedConfig;
}
