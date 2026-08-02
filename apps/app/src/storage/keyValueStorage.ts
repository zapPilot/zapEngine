export interface KeyValueStorage {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
}

export function createWebKeyValueStorage(): KeyValueStorage {
  return {
    getItem(key) {
      return Promise.resolve(globalThis.localStorage?.getItem(key) ?? null);
    },
    setItem(key, value) {
      globalThis.localStorage?.setItem(key, value);
      return Promise.resolve();
    },
  };
}
