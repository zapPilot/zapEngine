import appKeyValueStorage from '@/storage/appKeyValueStorage';
import { createLocaleStorage } from '@/storage/localeStorageCore';

const localeStorage = createLocaleStorage(appKeyValueStorage);

export const { loadLocale, saveLocale } = localeStorage;
