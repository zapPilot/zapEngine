import AsyncStorage from '@react-native-async-storage/async-storage';

import { createLocaleStorage } from '@/storage/localeStorageCore';

const localeStorage = createLocaleStorage(AsyncStorage);

export const { loadLocale, saveLocale } = localeStorage;
