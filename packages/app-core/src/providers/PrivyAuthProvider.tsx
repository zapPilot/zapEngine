import { getPrivyAppId } from '@core/lib/env/privy';
import { type PrivyClientConfig, PrivyProvider } from '@privy-io/react-auth';
import { type ReactNode } from 'react';
import { arbitrum, base, optimism } from 'viem/chains';

/**
 * Privy bundles its own `Chain` type (from `@privy-io/js-sdk-core`, with
 * `testnet` required) which is structurally incompatible with the repo's viem
 * `Chain` (`testnet` optional) under `exactOptionalPropertyTypes`. The runtime
 * objects are valid viem chains, so we bridge the type skew in one place.
 */
type PrivyChain = NonNullable<PrivyClientConfig['supportedChains']>[number];
const PRIVY_SUPPORTED_CHAINS = [
  arbitrum,
  base,
  optimism,
] as unknown as PrivyChain[];
const PRIVY_DEFAULT_CHAIN = arbitrum as unknown as PrivyChain;

const privyConfig: PrivyClientConfig = {
  appearance: { theme: 'dark' },
  loginMethods: ['email', 'google', 'apple'],
  embeddedWallets: {
    ethereum: { createOnLogin: 'users-without-wallets' },
  },
  defaultChain: PRIVY_DEFAULT_CHAIN,
  supportedChains: PRIVY_SUPPORTED_CHAINS,
};

interface PrivyAuthProviderProps {
  children: ReactNode;
}

/**
 * Privy auth + embedded-wallet provider for the Zap Wallet flow.
 *
 * Provides the "Create Zap Wallet" experience: email/Google/Apple login that
 * auto-provisions an embedded EOA. Privy is treated as replaceable
 * infrastructure — it sits behind the `useWalletProvider()` adapter, so the
 * rest of the app never imports Privy directly.
 *
 * `VITE_PRIVY_APP_ID` is required: when unset this provider throws so the
 * bundle app fails fast instead of silently rendering without a wallet
 * backend.
 */
export function PrivyAuthProvider({ children }: PrivyAuthProviderProps) {
  const appId = getPrivyAppId();

  if (!appId) {
    throw new Error(
      'Missing required VITE_PRIVY_APP_ID for Privy wallet configuration.',
    );
  }

  return (
    <PrivyProvider appId={appId} config={privyConfig}>
      {children}
    </PrivyProvider>
  );
}
