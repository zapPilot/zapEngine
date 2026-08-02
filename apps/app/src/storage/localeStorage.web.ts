import { createWebKeyValueStorage } from '@/storage/keyValueStorage';
import { createLocaleStorage } from '@/storage/localeStorageCore';

const localeStorage = createLocaleStorage(createWebKeyValueStorage());

export const { loadLocale, saveLocale } = localeStorage;
