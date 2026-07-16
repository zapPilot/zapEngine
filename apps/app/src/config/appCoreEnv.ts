import { APP_RUNTIME } from '@/config/appRuntime';
import type { ExpoExtraConfig } from '@/config/mobileRuntimeConfig';

// Metro defines __DEV__ at build/runtime; vitest (node) does not, so guard the read.
function isDevBuild(): boolean {
  return typeof __DEV__ !== 'undefined' && __DEV__;
}

/**
 * Env map injected into app-core. Keys keep the `VITE_` prefix app-core reads;
 * values must stay as-is (literal EXPO_PUBLIC_* key accesses) so
 * babel-preset-expo can inline them at bundle time.
 */
export function buildAppCoreEnvSource(
  extra: ExpoExtraConfig = {},
): Record<string, string | undefined> {
  return {
    VITE_ACCOUNT_API_URL: process.env.EXPO_PUBLIC_ACCOUNT_API_URL,
    VITE_ANALYTICS_ENGINE_URL: process.env.EXPO_PUBLIC_ANALYTICS_ENGINE_URL,
    VITE_PRIVY_APP_ID: process.env.EXPO_PUBLIC_PRIVY_APP_ID,
    VITE_ALCHEMY_API_KEY:
      process.env.EXPO_PUBLIC_ALCHEMY_API_KEY || extra.alchemyApiKey,
    VITE_MORALIS_API_KEY: process.env.EXPO_PUBLIC_MORALIS_API_KEY,
    VITE_PODCAST_API_URL: process.env.EXPO_PUBLIC_PODCAST_API_URL,
    // Key name kept: app-core's wallet-token provider switch reads it on
    // desktop and native alike.
    VITE_DESKTOP_WALLET_PROVIDER: process.env.EXPO_PUBLIC_WALLET_TOKEN_PROVIDER,
    VITE_PRIVY_CLIENT_ID: process.env.EXPO_PUBLIC_PRIVY_CLIENT_ID,
    VITE_WALLETCONNECT_PROJECT_ID:
      process.env.EXPO_PUBLIC_WALLETCONNECT_PROJECT_ID,
    VITE_APP_RUNTIME: APP_RUNTIME,
    MODE: isDevBuild() ? 'development' : 'production',
  };
}
