import AsyncStorage from '@react-native-async-storage/async-storage';

import { createPodcastStorage } from '@/storage/podcastStorageCore';

const podcastStorage = createPodcastStorage(AsyncStorage);

export const {
  loadPodcastProgress,
  savePodcastProgress,
  loadPodcastSpeedPreferences,
  savePodcastSpeedPreferences,
} = podcastStorage;
