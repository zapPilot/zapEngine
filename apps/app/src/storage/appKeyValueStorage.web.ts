import type { KeyValueStorage } from '@/storage/keyValueStorage';

const appKeyValueStorage: KeyValueStorage = {
  getItem(key) {
    return Promise.resolve(globalThis.localStorage?.getItem(key) ?? null);
  },
  setItem(key, value) {
    globalThis.localStorage?.setItem(key, value);
    return Promise.resolve();
  },
};

export default appKeyValueStorage;
