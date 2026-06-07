import { type PrivyClientConfig, PrivyProvider } from '@privy-io/react-auth';
import { type ReactNode } from 'react';
import { arbitrum, base, optimism } from 'wagmi/chains';

import { getPrivyAppId } from '@/lib/env/privy';

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
 * Chains are kept aligned with the RainbowKit/wagmi config in `@/config/wagmi`.
 * When no App ID is configured this renders children unchanged so the app still
 * boots on the RainbowKit-only flow.
 */
export function PrivyAuthProvider({ children }: PrivyAuthProviderProps) {
  const appId = getPrivyAppId();

  if (!appId) {
    return <>{children}</>;
  }

  return (
    <PrivyProvider appId={appId} config={privyConfig}>
      {children}
    </PrivyProvider>
  );
}
