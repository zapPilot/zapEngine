import appKeyValueStorage from '@/storage/appKeyValueStorage';
import { createPodcastStorage } from '@/storage/podcastStorageCore';

const podcastStorage = createPodcastStorage(appKeyValueStorage);

export const {
  loadPodcastProgress,
  savePodcastProgress,
  loadPodcastSpeedPreferences,
  savePodcastSpeedPreferences,
  loadPodcastSortDirection,
  savePodcastSortDirection,
} = podcastStorage;
