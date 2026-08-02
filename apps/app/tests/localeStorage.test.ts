import { describe, expect, it, vi } from 'vitest';

import { CONTENT_LANGUAGE_STORAGE_KEY } from '@/config/contentLanguages';
import {
  APP_LOCALE_STORAGE_KEY,
  createLocaleStorage,
} from '@/storage/localeStorageCore';

describe('createLocaleStorage', () => {
  it('loads the current app locale', async () => {
    const storage = createLocaleStorage({
      getItem: vi.fn(async (key) =>
        key === APP_LOCALE_STORAGE_KEY ? 'ja' : null,
      ),
      setItem: vi.fn(async () => undefined),
    });

    await expect(storage.loadLocale()).resolves.toBe('ja');
  });

  it('migrates the legacy content language preference', async () => {
    const values = new Map<string, string>([
      [CONTENT_LANGUAGE_STORAGE_KEY, 'en'],
    ]);
    const storage = createLocaleStorage({
      getItem: async (key) => values.get(key) ?? null,
      setItem: async (key, value) => {
        values.set(key, value);
      },
    });

    await expect(storage.loadLocale()).resolves.toBe('en');
    expect(values.get(APP_LOCALE_STORAGE_KEY)).toBe('en');
  });

  it('ignores invalid stored values', async () => {
    const storage = createLocaleStorage({
      getItem: vi.fn(async () => 'ko'),
      setItem: vi.fn(async () => undefined),
    });

    await expect(storage.loadLocale()).resolves.toBeNull();
  });

  it('persists the selected locale', async () => {
    const setItem = vi.fn(async () => undefined);
    const storage = createLocaleStorage({
      getItem: vi.fn(async () => null),
      setItem,
    });

    await storage.saveLocale('zh-Hant');

    expect(setItem).toHaveBeenCalledWith(APP_LOCALE_STORAGE_KEY, 'zh-Hant');
  });
});
