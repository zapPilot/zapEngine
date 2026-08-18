import {
  PODCAST_PROGRESS_STORAGE_KEY,
  type PodcastEpisodeProgress,
  type PodcastProgressMap,
} from '@/integration/podcastProgress';
import {
  DEFAULT_PODCAST_SPEED_PREFERENCES,
  parseStoredSpeedPreferences,
  PODCAST_SPEED_PREFERENCES_STORAGE_KEY,
  type PodcastSpeedPreferences,
} from '@/integration/podcastSections';
import type { KeyValueStorage } from '@/storage/keyValueStorage';

export type PodcastKeyValueStorage = KeyValueStorage;

export interface PodcastStorage {
  loadPodcastProgress: () => Promise<PodcastProgressMap>;
  savePodcastProgress: (progress: PodcastProgressMap) => Promise<void>;
  loadPodcastSpeedPreferences: () => Promise<PodcastSpeedPreferences>;
  savePodcastSpeedPreferences: (
    preferences: PodcastSpeedPreferences,
  ) => Promise<void>;
}

function isPodcastEpisodeProgress(
  value: unknown,
): value is PodcastEpisodeProgress {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  const section = record['lastPositionSection'];
  const language = record['lastPositionClassroomLanguage'];
  return (
    typeof record['listened'] === 'boolean' &&
    typeof record['lastPositionSeconds'] === 'number' &&
    Number.isFinite(record['lastPositionSeconds']) &&
    record['lastPositionSeconds'] >= 0 &&
    (section === undefined || section === 'main' || section === 'classroom') &&
    (language === undefined || typeof language === 'string')
  );
}

export function parseStoredPodcastProgress(
  raw: string | null,
): PodcastProgressMap {
  if (raw === null) return {};

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return {};
    }

    const progress: PodcastProgressMap = {};
    for (const [localizationId, value] of Object.entries(parsed)) {
      if (isPodcastEpisodeProgress(value)) {
        progress[localizationId] = value;
      }
    }
    return progress;
  } catch {
    return {};
  }
}

/**
 * Builds the shared podcast store over a platform key-value backend. Writes are
 * serialized so a slower earlier write can never land after a newer value.
 */
export function createPodcastStorage(
  storage: PodcastKeyValueStorage,
): PodcastStorage {
  let writeQueue = Promise.resolve();

  const enqueueWrite = (key: string, value: string): Promise<void> => {
    const write = writeQueue.then(
      () => storage.setItem(key, value),
      () => storage.setItem(key, value),
    );
    writeQueue = write.catch(() => undefined);
    return writeQueue;
  };

  return {
    async loadPodcastProgress() {
      try {
        return parseStoredPodcastProgress(
          await storage.getItem(PODCAST_PROGRESS_STORAGE_KEY),
        );
      } catch {
        return {};
      }
    },
    savePodcastProgress(progress) {
      return enqueueWrite(
        PODCAST_PROGRESS_STORAGE_KEY,
        JSON.stringify(progress),
      );
    },
    async loadPodcastSpeedPreferences() {
      try {
        const raw = await storage.getItem(
          PODCAST_SPEED_PREFERENCES_STORAGE_KEY,
        );
        if (raw === null) {
          return { ...DEFAULT_PODCAST_SPEED_PREFERENCES };
        }
        return parseStoredSpeedPreferences(JSON.parse(raw) as unknown);
      } catch {
        return { ...DEFAULT_PODCAST_SPEED_PREFERENCES };
      }
    },
    savePodcastSpeedPreferences(preferences) {
      return enqueueWrite(
        PODCAST_SPEED_PREFERENCES_STORAGE_KEY,
        JSON.stringify(preferences),
      );
    },
  };
}
