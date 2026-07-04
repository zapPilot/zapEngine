import Constants from 'expo-constants';

import {
  type ExpoExtraConfig,
  getMobileRuntimeConfig,
} from './mobileRuntimeConfig';

function readExpoExtra(): ExpoExtraConfig {
  return (Constants.expoConfig?.extra ?? {}) as ExpoExtraConfig;
}

export function getExpoMobileRuntimeConfig() {
  return getMobileRuntimeConfig(readExpoExtra());
}
