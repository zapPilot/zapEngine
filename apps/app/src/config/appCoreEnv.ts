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
  const privyAppId =
    APP_RUNTIME === 'native'
      ? process.env.EXPO_PUBLIC_PRIVY_APP_ID || extra.privyMobileAppId
      : extra.privyWebAppId || process.env.EXPO_PUBLIC_PRIVY_APP_ID;

  return {
    VITE_ACCOUNT_API_URL: process.env.EXPO_PUBLIC_ACCOUNT_API_URL,
    VITE_ANALYTICS_ENGINE_URL: process.env.EXPO_PUBLIC_ANALYTICS_ENGINE_URL,
    VITE_PRIVY_APP_ID: privyAppId,
    VITE_ALCHEMY_API_KEY:
      process.env.EXPO_PUBLIC_ALCHEMY_API_KEY || extra.alchemyApiKey,
    VITE_MORALIS_API_KEY: process.env.EXPO_PUBLIC_MORALIS_API_KEY,
    VITE_PODCAST_API_URL: process.env.EXPO_PUBLIC_PODCAST_API_URL,
    VITE_PRIVY_CLIENT_ID: process.env.EXPO_PUBLIC_PRIVY_CLIENT_ID,
    VITE_SENTRY_DSN: process.env.EXPO_PUBLIC_SENTRY_DSN,
    VITE_APP_RUNTIME: APP_RUNTIME,
    MODE: isDevBuild() ? 'development' : 'production',
  };
}
