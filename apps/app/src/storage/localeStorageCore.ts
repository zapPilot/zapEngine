import {
  CONTENT_LANGUAGE_STORAGE_KEY,
  type ContentLanguageCode,
  isContentLanguageCode,
} from '@/config/contentLanguages';
import {
  createSerializedWriter,
  type KeyValueStorage,
} from '@/storage/keyValueStorage';

export const APP_LOCALE_STORAGE_KEY = 'app_locale';

export interface LocaleStorage {
  loadLocale: () => Promise<ContentLanguageCode | null>;
  saveLocale: (locale: ContentLanguageCode) => Promise<void>;
}

export function createLocaleStorage(storage: KeyValueStorage): LocaleStorage {
  const writer = createSerializedWriter(storage);

  const saveLocale = (locale: ContentLanguageCode): Promise<void> =>
    writer.write(APP_LOCALE_STORAGE_KEY, locale);

  return {
    async loadLocale() {
      try {
        const current = await storage.getItem(APP_LOCALE_STORAGE_KEY);
        if (current !== null && isContentLanguageCode(current)) return current;

        const legacy = await storage.getItem(CONTENT_LANGUAGE_STORAGE_KEY);
        if (legacy !== null && isContentLanguageCode(legacy)) {
          await saveLocale(legacy);
          return legacy;
        }
      } catch {
        return null;
      }
      return null;
    },
    saveLocale,
  };
}
