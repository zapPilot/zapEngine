import {
  parseStoredVideoDownloads,
  PODCAST_VIDEO_DOWNLOADS_STORAGE_KEY,
  type PodcastVideoDownloadRecord,
} from '@/integration/podcastVideoDownloads';
import {
  createSerializedWriter,
  type KeyValueStorage,
} from './keyValueStorage';

export function createPodcastDownloadStorage(storage: KeyValueStorage) {
  // SerializedWriter intentionally absorbs backend errors for progress saves.
  // Downloads need an acknowledgement before declaring files durable.
  const acknowledgements: {
    resolve: () => void;
    reject: (error: unknown) => void;
  }[] = [];
  const writer = createSerializedWriter({
    getItem: storage.getItem,
    async setItem(key, value) {
      const acknowledgement = acknowledgements.shift()!;
      try {
        await storage.setItem(key, value);
        acknowledgement.resolve();
      } catch (error) {
        acknowledgement.reject(error);
      }
    },
  });
  return {
    async load(): Promise<PodcastVideoDownloadRecord[]> {
      return parseStoredVideoDownloads(
        await storage.getItem(PODCAST_VIDEO_DOWNLOADS_STORAGE_KEY),
      );
    },
    save(records: readonly PodcastVideoDownloadRecord[]): Promise<void> {
      const result = new Promise<void>((resolve, reject) =>
        acknowledgements.push({ resolve, reject }),
      );
      void writer.write(
        PODCAST_VIDEO_DOWNLOADS_STORAGE_KEY,
        JSON.stringify(records),
      );
      return result;
    },
  };
}
