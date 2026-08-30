import { describe, expect, it, vi } from 'vitest';

import {
  createPodcastStorage,
  parseStoredPodcastSortDirection,
  PODCAST_SORT_DIRECTION_STORAGE_KEY,
  type PodcastKeyValueStorage,
} from '@/storage/podcastStorageCore';

const nativeStorageMock = vi.hoisted(() => ({
  getItem: vi.fn(),
  setItem: vi.fn(),
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: nativeStorageMock,
}));

function deferred(): {
  promise: Promise<void>;
  resolve: () => void;
} {
  let resolve: (() => void) | undefined;
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return {
    promise,
    resolve: () => resolve?.(),
  };
}

describe('parseStoredPodcastSortDirection', () => {
  it('returns oldest when stored is oldest', () => {
    expect(parseStoredPodcastSortDirection('oldest')).toBe('oldest');
  });

  it('returns newest when stored is newest', () => {
    expect(parseStoredPodcastSortDirection('newest')).toBe('newest');
  });

  it('falls back to newest for null, empty, corrupt, or unknown', () => {
    expect(parseStoredPodcastSortDirection(null)).toBe('newest');
    expect(parseStoredPodcastSortDirection('')).toBe('newest');
    expect(parseStoredPodcastSortDirection('OLDEST')).toBe('newest');
    expect(parseStoredPodcastSortDirection('random')).toBe('newest');
    expect(parseStoredPodcastSortDirection('"oldest"')).toBe('newest');
  });
});

describe('createPodcastStorage sort direction', () => {
  it('loads durable sort direction from the backend', async () => {
    const values = new Map<string, string>([
      [PODCAST_SORT_DIRECTION_STORAGE_KEY, 'oldest'],
    ]);
    const storage = createPodcastStorage({
      getItem: async (key) => values.get(key) ?? null,
      setItem: async (key, value) => {
        values.set(key, value);
      },
    });

    await expect(storage.loadPodcastSortDirection()).resolves.toBe('oldest');
  });

  it('falls back to newest for unknown or missing value', async () => {
    const storage = createPodcastStorage({
      getItem: async () => 'corrupt',
      setItem: async () => undefined,
    });
    await expect(storage.loadPodcastSortDirection()).resolves.toBe('newest');

    const missing = createPodcastStorage({
      getItem: async () => null,
      setItem: async () => undefined,
    });
    await expect(missing.loadPodcastSortDirection()).resolves.toBe('newest');
  });

  it('serializes sort-direction writes so the newest value is stored last', async () => {
    const firstWrite = deferred();
    const storedValues: string[] = [];
    const backend: PodcastKeyValueStorage = {
      getItem: vi.fn(async () => null),
      setItem: vi.fn(async (_key, value) => {
        storedValues.push(value);
        if (storedValues.length === 1) {
          await firstWrite.promise;
        }
      }),
    };
    const storage = createPodcastStorage(backend);

    const older = storage.savePodcastSortDirection('oldest');
    const newer = storage.savePodcastSortDirection('newest');

    await Promise.resolve();
    expect(backend.setItem).toHaveBeenCalledTimes(1);
    firstWrite.resolve();
    await Promise.all([older, newer]);

    expect(storedValues).toEqual(['oldest', 'newest']);
  });

  it('waits for queued writes before loading the sort direction', async () => {
    const writeGate = deferred();
    let stored: string = 'newest';
    const backend: PodcastKeyValueStorage = {
      getItem: vi.fn(async () => stored),
      setItem: vi.fn(async (_key, value) => {
        await writeGate.promise;
        stored = value;
      }),
    };
    const storage = createPodcastStorage(backend);

    const pendingWrite = storage.savePodcastSortDirection('oldest');
    await Promise.resolve();

    const pendingLoad = storage.loadPodcastSortDirection();
    await Promise.resolve();
    expect(backend.getItem).not.toHaveBeenCalled();

    writeGate.resolve();
    await pendingWrite;
    await expect(pendingLoad).resolves.toBe('oldest');
    expect(backend.getItem).toHaveBeenCalledWith(
      PODCAST_SORT_DIRECTION_STORAGE_KEY,
    );
  });

  it('uses newest when backend reads reject', async () => {
    const storage = createPodcastStorage({
      getItem: async () => {
        throw new Error('unavailable');
      },
      setItem: async () => undefined,
    });

    await expect(storage.loadPodcastSortDirection()).resolves.toBe('newest');
  });
});

describe('native podcast sort-direction adapter', () => {
  it('loads and saves sort direction through AsyncStorage', async () => {
    nativeStorageMock.getItem.mockResolvedValue('oldest');
    nativeStorageMock.setItem.mockResolvedValue(undefined);
    const storage = await import('@/storage/podcastStorage.native');

    await expect(storage.loadPodcastSortDirection()).resolves.toBe('oldest');
    await storage.savePodcastSortDirection('newest');

    expect(nativeStorageMock.getItem).toHaveBeenCalledWith(
      PODCAST_SORT_DIRECTION_STORAGE_KEY,
    );
    expect(nativeStorageMock.setItem).toHaveBeenCalledWith(
      PODCAST_SORT_DIRECTION_STORAGE_KEY,
      'newest',
    );
  });
});
