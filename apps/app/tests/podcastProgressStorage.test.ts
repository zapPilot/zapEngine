import { describe, expect, it, vi } from 'vitest';

import {
  createPodcastStorage,
  parseStoredPodcastProgress,
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

describe('parseStoredPodcastProgress', () => {
  it('accepts valid main and classroom progress entries', () => {
    expect(
      parseStoredPodcastProgress(
        JSON.stringify({
          main: { listened: false, lastPositionSeconds: 120 },
          classroom: {
            listened: true,
            lastPositionSeconds: 45,
            lastPositionSection: 'classroom',
          },
        }),
      ),
    ).toEqual({
      main: { listened: false, lastPositionSeconds: 120 },
      classroom: {
        listened: true,
        lastPositionSeconds: 45,
        lastPositionSection: 'classroom',
      },
    });
  });

  it('falls back safely for corrupt JSON and drops malformed entries', () => {
    expect(parseStoredPodcastProgress('{broken')).toEqual({});
    expect(parseStoredPodcastProgress('[]')).toEqual({});
    expect(
      parseStoredPodcastProgress(
        JSON.stringify({
          valid: { listened: false, lastPositionSeconds: 30 },
          negative: { listened: false, lastPositionSeconds: -1 },
          invalidSection: {
            listened: false,
            lastPositionSeconds: 10,
            lastPositionSection: 'bonus',
          },
        }),
      ),
    ).toEqual({
      valid: { listened: false, lastPositionSeconds: 30 },
    });
  });

  it('accepts a valid saved classroom language', () => {
    expect(
      parseStoredPodcastProgress(
        JSON.stringify({
          classroom: {
            listened: false,
            lastPositionSeconds: 45,
            lastPositionSection: 'classroom',
            lastPositionClassroomLanguage: 'ja',
          },
        }),
      ),
    ).toEqual({
      classroom: {
        listened: false,
        lastPositionSeconds: 45,
        lastPositionSection: 'classroom',
        lastPositionClassroomLanguage: 'ja',
      },
    });
  });

  it('drops an entry whose saved classroom language is not a string', () => {
    expect(
      parseStoredPodcastProgress(
        JSON.stringify({
          invalidLanguage: {
            listened: false,
            lastPositionSeconds: 45,
            lastPositionSection: 'classroom',
            lastPositionClassroomLanguage: 42,
          },
        }),
      ),
    ).toEqual({});
  });

  it('accepts an entry carrying an unknown extra key (forward compatibility)', () => {
    // The storage layer only validates the fields it knows about; an unknown
    // key written by a newer app version must survive a round trip on an
    // older one rather than getting the whole entry dropped.
    expect(
      parseStoredPodcastProgress(
        JSON.stringify({
          episode: {
            listened: false,
            lastPositionSeconds: 30,
            futureField: 'from a newer app version',
          },
        }),
      ),
    ).toEqual({
      episode: {
        listened: false,
        lastPositionSeconds: 30,
        futureField: 'from a newer app version',
      },
    });
  });
});

describe('createPodcastStorage', () => {
  it('loads durable progress and speed preferences from the backend', async () => {
    const values = new Map<string, string>([
      [
        'podcast_episode_progress',
        JSON.stringify({
          episode: { listened: false, lastPositionSeconds: 120 },
        }),
      ],
      [
        'podcast_speed_preferences',
        JSON.stringify({ mainSpeed: 1.5, classroomSpeed: 0.8 }),
      ],
    ]);
    const storage = createPodcastStorage({
      getItem: async (key) => values.get(key) ?? null,
      setItem: async (key, value) => {
        values.set(key, value);
      },
    });

    await expect(storage.loadPodcastProgress()).resolves.toEqual({
      episode: { listened: false, lastPositionSeconds: 120 },
    });
    await expect(storage.loadPodcastSpeedPreferences()).resolves.toEqual({
      mainSpeed: 1.5,
      classroomSpeed: 0.8,
    });
  });

  it('serializes writes so the newest value is always stored last', async () => {
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

    const older = storage.savePodcastProgress({
      episode: { listened: false, lastPositionSeconds: 120 },
    });
    const newer = storage.savePodcastProgress({
      episode: { listened: false, lastPositionSeconds: 150 },
    });

    await Promise.resolve();
    expect(backend.setItem).toHaveBeenCalledTimes(1);
    firstWrite.resolve();
    await Promise.all([older, newer]);

    expect(storedValues.map((value) => JSON.parse(value))).toEqual([
      { episode: { listened: false, lastPositionSeconds: 120 } },
      { episode: { listened: false, lastPositionSeconds: 150 } },
    ]);
  });

  it('uses safe defaults when backend reads reject', async () => {
    const storage = createPodcastStorage({
      getItem: async () => {
        throw new Error('unavailable');
      },
      setItem: async () => undefined,
    });

    await expect(storage.loadPodcastProgress()).resolves.toEqual({});
    await expect(storage.loadPodcastSpeedPreferences()).resolves.toEqual({
      mainSpeed: 1,
      classroomSpeed: 1,
    });
  });
});

describe('native podcast storage adapter', () => {
  it('loads and saves progress and speed through AsyncStorage', async () => {
    nativeStorageMock.getItem.mockImplementation(async (key: string) =>
      key === 'podcast_episode_progress'
        ? JSON.stringify({
            episode: { listened: false, lastPositionSeconds: 120 },
          })
        : JSON.stringify({ mainSpeed: 1.5, classroomSpeed: 0.8 }),
    );
    nativeStorageMock.setItem.mockResolvedValue(undefined);
    const storage = await import('@/storage/podcastStorage.native');

    await expect(storage.loadPodcastProgress()).resolves.toEqual({
      episode: { listened: false, lastPositionSeconds: 120 },
    });
    await expect(storage.loadPodcastSpeedPreferences()).resolves.toEqual({
      mainSpeed: 1.5,
      classroomSpeed: 0.8,
    });
    await storage.savePodcastProgress({
      episode: { listened: false, lastPositionSeconds: 150 },
    });
    await storage.savePodcastSpeedPreferences({
      mainSpeed: 2,
      classroomSpeed: 0.75,
    });

    expect(nativeStorageMock.getItem).toHaveBeenCalledWith(
      'podcast_episode_progress',
    );
    expect(nativeStorageMock.getItem).toHaveBeenCalledWith(
      'podcast_speed_preferences',
    );
    expect(nativeStorageMock.setItem).toHaveBeenCalledWith(
      'podcast_episode_progress',
      JSON.stringify({
        episode: { listened: false, lastPositionSeconds: 150 },
      }),
    );
    expect(nativeStorageMock.setItem).toHaveBeenCalledWith(
      'podcast_speed_preferences',
      JSON.stringify({ mainSpeed: 2, classroomSpeed: 0.75 }),
    );
  });
});
