import type { HyperliquidAgentKeyStore } from '@zapengine/app-core/types';
import * as SecureStore from 'expo-secure-store';

const hyperliquidAgentKeyStorage: HyperliquidAgentKeyStore = {
  load(key) {
    return SecureStore.getItemAsync(key);
  },
  save(key, value) {
    return SecureStore.setItemAsync(key, value, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  },
  remove(key) {
    return SecureStore.deleteItemAsync(key);
  },
};

export default hyperliquidAgentKeyStorage;
