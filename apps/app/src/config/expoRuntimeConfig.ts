import Constants from 'expo-constants';

import {
  type ExpoExtraConfig,
  getMobileRuntimeConfig,
} from './mobileRuntimeConfig';

export function readExpoExtra(): ExpoExtraConfig {
  const extra = (Constants.expoConfig?.extra ?? {}) as ExpoExtraConfig;
  const privyAppId = extra.privyAppId || process.env.EXPO_PUBLIC_PRIVY_APP_ID;
  const privyClientId =
    extra.privyClientId || process.env.EXPO_PUBLIC_PRIVY_CLIENT_ID;

  return {
    ...extra,
    ...(privyAppId ? { privyAppId } : {}),
    ...(privyClientId ? { privyClientId } : {}),
  };
}

export function getExpoMobileRuntimeConfig() {
  return getMobileRuntimeConfig(readExpoExtra());
}
