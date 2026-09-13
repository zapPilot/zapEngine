import type { HyperliquidAgentKeyStore } from '@zapengine/app-core/types';

const hyperliquidAgentKeyStorage: HyperliquidAgentKeyStore = {
  load(key) {
    return Promise.resolve(globalThis.localStorage?.getItem(key) ?? null);
  },
  save(key, value) {
    if (!globalThis.localStorage) {
      return Promise.reject(
        new Error(
          'Local storage is unavailable; Hyperliquid signing cannot be enabled.',
        ),
      );
    }
    globalThis.localStorage.setItem(key, value);
    return Promise.resolve();
  },
  remove(key) {
    globalThis.localStorage?.removeItem(key);
    return Promise.resolve();
  },
};

export default hyperliquidAgentKeyStorage;
