import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const db: unknown = null;
  return {
    env: {
      R2_BUCKET_NAME: 'bucket',
      R2_PUBLIC_BASE_URL: 'https://cdn.test/',
      R2_ENDPOINT: 'https://r2.test',
      R2_ACCESS_KEY_ID: 'key',
      R2_SECRET_ACCESS_KEY: 'secret',
    },
    db,
    listR2Objects: vi.fn(),
    deleteR2Objects: vi.fn(),
    s3Configs: [] as unknown[],
  };
});

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: class {
    constructor(config: unknown) {
      mocks.s3Configs.push(config);
    }
  },
}));

vi.mock('../lib/env.js', () => ({
  getRequiredEnv: (name: string) => mocks.env[name as keyof typeof mocks.env],
  trimTrailingSlash: (value: string) => {
    let end = value.length;
    while (end > 0 && value.at(end - 1) === '/') end -= 1;
    return value.slice(0, end);
  },
}));

vi.mock('./r2-objects.js', () => ({
  listR2Objects: mocks.listR2Objects,
  deleteR2Objects: mocks.deleteR2Objects,
}));

vi.mock('./supabase-client.js', () => ({
  getPipelineSupabase: () => mocks.db,
  throwSupabaseError: (error: unknown) => {
    throw error instanceof Error ? error : new Error(String(error));
  },
}));

import {
  createArtifactGcDependencies,
  type GcDependencies,
  readArtifactReferences,
  readArtifactReferenceState,
  runArtifactGc,
} from './artifact-gc.js';
import { ARTIFACT_GRACE_MS } from './artifact-retention.js';
import type { PipelineSupabaseClient } from './supabase-client.js';

const now = Date.parse('2026-09-15T00:00:00Z');
const video = (hash: string) => `episodes/ep/localizations/en/video/v9/${hash}`;
const stored = (prefix: string, modified = now - ARTIFACT_GRACE_MS - 1) => ({
  key: `${prefix}/video.mp4`,
  size: 10,
  modified: new Date(modified),
});

function gcDeps(objects: ReturnType<typeof stored>[]): GcDependencies {
  return {
    list: vi.fn().mockResolvedValue(objects),
    readState: vi.fn().mockResolvedValue({
      references: new Set<string>(),
      retirements: new Map<string, number>(),
    }),
    acquire: vi.fn().mockResolvedValue(undefined),
    release: vi.fn().mockResolvedValue(undefined),
    observe: vi.fn().mockResolvedValue(undefined),
    clearObservation: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
    log: vi.fn(),
  };
}

function selectDb(
  rowsByTable: Record<string, Record<string, unknown>[] | null>,
): PipelineSupabaseClient {
  return {
    from: (table: string) => {
      let key = '';
      let cursor: string | undefined;
      const query = {
        select: () => query,
        order: (value: string) => {
          key = value;
          return query;
        },
        limit: () => query,
        gt: (_key: string, value: string) => {
          cursor = value;
          return query;
        },
        then: (resolve: (value: unknown) => unknown) => {
          const rows = rowsByTable[table];
          if (rows === null)
            return Promise.resolve(resolve({ data: null, error: null }));
          const filtered = (rows ?? []).filter(
            (row) => cursor === undefined || String(row[key]) > cursor,
          );
          return Promise.resolve(resolve({ data: filtered, error: null }));
        },
      };
      return query;
    },
  } as unknown as PipelineSupabaseClient;
}

beforeEach(() => {
  mocks.listR2Objects.mockReset().mockResolvedValue([]);
  mocks.deleteR2Objects.mockReset().mockResolvedValue(undefined);
  mocks.s3Configs.length = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('artifact GC remaining branches', () => {
  it('uses the current clock by default and skips known non-eligible retirements', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const young = video('young');
    const deps = gcDeps([stored(young, now - 1)]);
    vi.mocked(deps.readState).mockResolvedValue({
      references: new Set(),
      retirements: new Map([[young, now - 1]]),
    });

    const result = await runArtifactGc(deps, { apply: true });

    expect(result.candidatePrefixes).toBe(1);
    expect(deps.observe).not.toHaveBeenCalled();
    expect(deps.remove).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('rejects incomplete row reads', async () => {
    await expect(
      readArtifactReferences(
        selectDb({ episode_videos: null }),
        'https://cdn.test',
      ),
    ).rejects.toThrow('Incomplete GC reference read: episode_videos');
  });

  it('rejects a first-page row without a string cursor', async () => {
    await expect(
      readArtifactReferences(
        selectDb({
          episode_videos: [{ episode_localization_id: 123 }],
        }),
        'https://cdn.test',
      ),
    ).rejects.toThrow('Invalid GC cursor: episode_videos');
  });

  it('rejects a non-advancing cursor and traverses arrays and ignored primitives', async () => {
    let page = 0;
    const db = {
      from: (table: string) => {
        let key = '';
        const query = {
          select: () => query,
          order: (value: string) => {
            key = value;
            return query;
          },
          limit: () => query,
          gt: () => query,
          then: (resolve: (value: unknown) => unknown) => {
            if (table !== 'episode_videos')
              return Promise.resolve(resolve({ data: [], error: null }));
            page++;
            const data =
              page === 1
                ? [
                    {
                      episode_localization_id: 'a',
                      manifest: [
                        `https://cdn.test/${video('array')}/manifest.json?x=1`,
                        42,
                        null,
                      ],
                    },
                  ]
                : [{ episode_localization_id: 'a', [key]: 'a' }];
            return Promise.resolve(resolve({ data, error: null }));
          },
        };
        return query;
      },
    } as unknown as PipelineSupabaseClient;

    await expect(
      readArtifactReferences(db, 'https://cdn.test/'),
    ).rejects.toThrow('Invalid GC cursor: episode_videos');
  });

  it('collects nested arrays and objects while ignoring primitive payload values', async () => {
    const prefix = video('nested');
    const db = selectDb({
      episode_videos: [
        {
          episode_localization_id: 'a',
          manifest: {
            values: [
              `https://cdn.test/${prefix}/manifest.json?cache=1`,
              42,
              null,
              false,
            ],
          },
        },
      ],
      episode_video_visuals: [],
    });

    await expect(
      readArtifactReferences(db, 'https://cdn.test'),
    ).resolves.toEqual(new Set([prefix]));
  });

  it('rejects malformed retirement rows', async () => {
    const db = selectDb({
      episode_videos: [],
      episode_video_visuals: [],
      artifact_retirements: [{ r2_prefix: 'x', unreferenced_at: 123 }],
    });
    await expect(
      readArtifactReferenceState(db, 'https://cdn.test'),
    ).rejects.toThrow('Invalid artifact retirement row');
  });
});

describe('createArtifactGcDependencies', () => {
  function dependencyDb(
    options: {
      rpcError?: Error;
      upsertError?: Error;
      deleteError?: Error;
    } = {},
  ) {
    const rpc = vi.fn(async () => ({ error: options.rpcError ?? null }));
    const from = vi.fn((table: string) => {
      if (table === 'artifact_retirements') {
        const selectQuery = {
          select: () => selectQuery,
          order: () => selectQuery,
          limit: () => selectQuery,
          then: (resolve: (value: unknown) => unknown) =>
            Promise.resolve(resolve({ data: [], error: null })),
          upsert: vi.fn(async () => ({ error: options.upsertError ?? null })),
          delete: () => ({
            eq: vi.fn(async () => ({ error: options.deleteError ?? null })),
          }),
        };
        return selectQuery;
      }
      const query = {
        select: () => query,
        order: () => query,
        limit: () => query,
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve(resolve({ data: [], error: null })),
      };
      return query;
    });
    return { rpc, from };
  }

  it('wires list, state, fences, observations, deletion, and logging', async () => {
    const db = dependencyDb();
    mocks.db = db;
    mocks.listR2Objects.mockResolvedValue([stored(video('listed'))]);
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const deps = createArtifactGcDependencies();

    await expect(deps.list()).resolves.toHaveLength(1);
    await expect(deps.readState()).resolves.toEqual({
      references: new Set(),
      retirements: new Map(),
    });
    await deps.acquire('owner');
    await deps.release('owner');
    await deps.observe('prefix', '2026-09-15T00:00:00.000Z');
    await deps.clearObservation('prefix');
    await deps.remove(['one', 'two']);
    deps.log({ event: 'covered' });

    expect(db.rpc).toHaveBeenNthCalledWith(1, 'acquire_artifact_gc', {
      p_owner: 'owner',
    });
    expect(db.rpc).toHaveBeenNthCalledWith(2, 'release_artifact_gc', {
      p_owner: 'owner',
    });
    expect(mocks.listR2Objects).toHaveBeenCalledWith(
      expect.anything(),
      'bucket',
      'episodes/',
    );
    expect(mocks.deleteR2Objects).toHaveBeenCalledWith(
      expect.anything(),
      'bucket',
      ['one', 'two'],
    );
    expect(info).toHaveBeenCalledWith(JSON.stringify({ event: 'covered' }));
    expect(mocks.s3Configs).toHaveLength(1);
  });

  it('propagates RPC, observation, and clear-observation database errors', async () => {
    mocks.db = dependencyDb({ rpcError: new Error('rpc') });
    await expect(
      createArtifactGcDependencies().acquire('owner'),
    ).rejects.toThrow('rpc');

    mocks.db = dependencyDb({ upsertError: new Error('upsert') });
    await expect(
      createArtifactGcDependencies().observe('prefix', 'at'),
    ).rejects.toThrow('upsert');

    mocks.db = dependencyDb({ deleteError: new Error('delete') });
    await expect(
      createArtifactGcDependencies().clearObservation('prefix'),
    ).rejects.toThrow('delete');
  });
});
