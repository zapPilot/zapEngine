import { arbitrum, base, optimism } from 'viem/chains';
import { type Config, createConfig, http } from 'wagmi';
// Import the connector from its own subpath, not the `wagmi/connectors`
// barrel — that barrel re-exports every connector (including `porto`, whose
// `ox` dependency Metro cannot resolve), which would pull the whole set into
// the web/desktop bundle just to use this one.
import { injected } from 'wagmi/connectors/injected';

/**
 * wagmi config for external-wallet login (web + Electron desktop only).
 *
 * `injected()` surfaces one connector per EIP-6963-announced browser
 * extension in real browsers.
 *
 * Deliberately no WalletConnect connector: it never had a UI entry point
 * (the picker allowlists injected wallets only), and wagmi eagerly
 * initializes it on page load, firing AppKit telemetry to
 * pulse.walletconnect.org that its options cannot disable.
 *
 * Lazily memoized so `createConfig` (which touches storage) never runs at
 * import time, matching the app-core "no module-scope env read" rule.
 */
let cachedConfig: Config | undefined;

export function getWagmiConfig(): Config {
  if (cachedConfig) {
    return cachedConfig;
  }

  cachedConfig = createConfig({
    chains: [arbitrum, base, optimism],
    connectors: [injected()],
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
