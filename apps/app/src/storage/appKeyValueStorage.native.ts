import AsyncStorage from '@react-native-async-storage/async-storage';

import type { KeyValueStorage } from '@/storage/keyValueStorage';

const appKeyValueStorage: KeyValueStorage = AsyncStorage;

export default appKeyValueStorage;
