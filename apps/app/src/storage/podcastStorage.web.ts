import { createPodcastStorage } from '@/storage/podcastStorageCore';

const podcastStorage = createPodcastStorage({
  getItem(key) {
    return Promise.resolve(globalThis.localStorage?.getItem(key) ?? null);
  },
  setItem(key, value) {
    globalThis.localStorage?.setItem(key, value);
    return Promise.resolve();
  },
});

export const {
  loadPodcastProgress,
  savePodcastProgress,
  loadPodcastSpeedPreferences,
  savePodcastSpeedPreferences,
} = podcastStorage;
