import { configureAppCoreEnv } from '@zapengine/app-core/lib/env/runtimeEnv';

// Metro defines __DEV__ at build/runtime; vitest (node) does not, so guard the read.
function isDevBuild(): boolean {
  return typeof __DEV__ !== 'undefined' && __DEV__;
}

/**
 * Env map injected into app-core. Keys keep the `VITE_` prefix app-core reads;
 * values must stay as-is (literal EXPO_PUBLIC_* key accesses) so
 * babel-preset-expo can inline them at bundle time.
 */
export function buildAppCoreEnvSource(): Record<string, string | undefined> {
  return {
    VITE_ACCOUNT_API_URL: process.env.EXPO_PUBLIC_ACCOUNT_API_URL,
    VITE_ANALYTICS_ENGINE_URL: process.env.EXPO_PUBLIC_ANALYTICS_ENGINE_URL,
    VITE_PRIVY_APP_ID: process.env.EXPO_PUBLIC_PRIVY_APP_ID,
    VITE_PRIVY_CLIENT_ID: process.env.EXPO_PUBLIC_PRIVY_CLIENT_ID,
    VITE_APP_RUNTIME: 'native',
    MODE: isDevBuild() ? 'development' : 'production',
  };
}

configureAppCoreEnv(buildAppCoreEnvSource());
