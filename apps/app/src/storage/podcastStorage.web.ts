import { createWebKeyValueStorage } from '@/storage/keyValueStorage';
import { createPodcastStorage } from '@/storage/podcastStorageCore';

const podcastStorage = createPodcastStorage(createWebKeyValueStorage());

export const {
  loadPodcastProgress,
  savePodcastProgress,
  loadPodcastSpeedPreferences,
  savePodcastSpeedPreferences,
  loadPodcastSortDirection,
  savePodcastSortDirection,
} = podcastStorage;
