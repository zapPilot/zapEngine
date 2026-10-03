import * as SecureStore from 'expo-secure-store';
import type { AccountSessionStorage } from '@/integration/accountSessionStore';

const storage: AccountSessionStorage = {
  load: (key) => SecureStore.getItemAsync(key),
  save: (key, value) =>
    SecureStore.setItemAsync(key, value, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    }),
  remove: (key) => SecureStore.deleteItemAsync(key),
};
export default storage;
