import { describe, expect, it } from 'vitest';
import { createPodcastDownloadStorage } from '@/storage/podcastDownloadStorageCore';
import { PODCAST_VIDEO_DOWNLOADS_STORAGE_KEY } from '@/integration/podcastVideoDownloads';
import { downloadRecord } from './support/podcastDownload';

describe('download storage', () => {
  it('keeps the newest write last even when the older write is slow', async () => {
    const map = new Map<string, string>();
    let release!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let calls = 0;
    const storage = createPodcastDownloadStorage({
      getItem: async (key) => map.get(key) ?? null,
      setItem: async (key, value) => {
        if (++calls === 1) await firstGate;
        map.set(key, value);
      },
    });
    expect(await storage.load()).toEqual([]);
    const first = storage.save([downloadRecord()]);
    const second = storage.save([]);
    await Promise.resolve();
    expect(calls).toBe(1);
    release();
    await Promise.all([first, second]);
    expect(map.get(PODCAST_VIDEO_DOWNLOADS_STORAGE_KEY)).toBe('[]');
    expect(await storage.load()).toEqual([]);
  });
  it('reports write failure without poisoning later writes', async () => {
    let fail = true;
    const map = new Map<string, string>();
    const storage = createPodcastDownloadStorage({
      getItem: async (key) => map.get(key) ?? null,
      setItem: async (key, value) => {
        if (fail) throw new Error('disk');
        map.set(key, value);
      },
    });
    await expect(storage.save([])).rejects.toThrow('disk');
    fail = false;
    await storage.save([downloadRecord()]);
    expect(await storage.load()).toEqual([downloadRecord()]);
  });
});
