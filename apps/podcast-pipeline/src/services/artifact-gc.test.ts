import { describe, expect, it, vi } from 'vitest';

import { type GcDependencies, runArtifactGc } from './artifact-gc.js';
import {
  ARTIFACT_GRACE_MS,
  classifyArtifactKey,
  planArtifactGc,
} from './artifact-retention.js';
import type { StoredObject } from './r2-objects.js';
const now = Date.parse('2026-09-15T00:00:00Z');
const old = now - ARTIFACT_GRACE_MS - 1;
const video = (hash: string) =>
  `episodes/ep/localizations/zh-Hant/video/v9/${hash}`;
const visual = 'episodes/ep/visuals/v9/hash';
const object = (
  prefix: string,
  file = 'video.mp4',
  time = old,
): StoredObject => ({
  key: `${prefix}/${file}`,
  size: 100,
  modified: new Date(time),
});

it.each([
  [`${video('hash')}/video.mp4`, 'video'],
  [`${visual}/images/image-01.png`, 'visual'],
  [`episodes/ep/covers/hash/${'a'.repeat(64)}.png`, 'cover'],
  ['transient/visual-checkpoints/ep/v9/hash/images/image-01.png', 'checkpoint'],
  ['transient/social/threads/hash/v1/video.mp4', 'threads'],
  ['episodes/ep/visuals/v9/checkpoints/hash/images/image-01.png', undefined],
  ['episodes/ep/localizations/zh-Hant/main/playlist.m3u8', undefined],
  ['episodes/../visuals/v9/hash/images/x.png', undefined],
])('classifies %s', (key, kind) =>
  expect(classifyArtifactKey(key)?.kind).toBe(kind),
);

it('blocks an entire artifact prefix when any sibling object is unfamiliar', () => {
  const prefix = video('mixed');
  const plan = planArtifactGc({
    now,
    references: new Set(),
    retirements: new Map([[prefix, old]]),
    objects: [object(prefix), object(prefix, 'unexpected.bin')],
  });

  expect(plan).toHaveLength(1);
  expect(plan[0]).toMatchObject({
    prefix,
    decision: 'malformed',
    bytes: 200,
  });
  expect(plan[0]?.objects.map(({ key }) => key)).toEqual([
    `${prefix}/video.mp4`,
    `${prefix}/unexpected.bin`,
  ]);
});

it('keeps current video/visual and grace versions across historical hashes', () => {
  const plan = planArtifactGc({
    now,
    references: new Set([video('current'), visual]),
    retirements: new Map([
      [video('old'), old],
      [video('recently-retired'), now - 1],
      [video('young'), old],
    ]),
    objects: [
      object(video('current')),
      object(visual, 'visual-manifest.json'),
      object(video('old')),
      object(video('recently-retired')),
      object(video('young'), 'video.mp4', now - 1),
      object(video('unknown')),
      object(video('bad'), 'unexpected.bin'),
    ],
  });
  expect(plan.map((p) => p.decision)).toEqual([
    'referenced',
    'referenced',
    'eligible',
    'grace',
    'young',
    'unobserved',
    'malformed',
  ]);
});

function fixture(): GcDependencies {
  return {
    list: vi
      .fn()
      .mockResolvedValue([
        object(video('old')),
        object(video('current')),
        object(video('unknown')),
      ]),
    readState: vi.fn().mockResolvedValue({
      references: new Set([video('current')]),
      retirements: new Map([[video('old'), old]]),
    }),
    acquire: vi.fn().mockResolvedValue(undefined),
    release: vi.fn().mockResolvedValue(undefined),
    observe: vi.fn().mockResolvedValue(undefined),
    clearObservation: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
    log: vi.fn(),
  };
}
describe('reference-aware GC', () => {
  it('dry-run makes zero mutations, including observations and fences', async () => {
    const deps = fixture();
    const result = await runArtifactGc(deps, { now });
    expect(result.deletedObjects).toBe(0);
    for (const call of [
      deps.acquire,
      deps.release,
      deps.observe,
      deps.clearObservation,
      deps.remove,
    ])
      expect(call).not.toHaveBeenCalled();
  });
  it('deletes only eligible unreferenced objects under a held fence', async () => {
    const deps = fixture();
    const result = await runArtifactGc(deps, { apply: true, now });
    expect(deps.remove).toHaveBeenCalledExactlyOnceWith([
      `${video('old')}/video.mp4`,
    ]);
    expect(deps.observe).toHaveBeenCalledWith(
      video('unknown'),
      new Date(now).toISOString(),
    );
    expect(result).toMatchObject({
      deletedObjects: 1,
      deletedBytes: 100,
      retainedReferences: 1,
    });
    expect(vi.mocked(deps.acquire).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(deps.readState).mock.invocationCallOrder[0]!,
    );
    expect(vi.mocked(deps.release).mock.invocationCallOrder[0]).toBeGreaterThan(
      vi.mocked(deps.remove).mock.invocationCallOrder[0]!,
    );
  });
  it('aborts without deletion on incomplete references and releases the fence', async () => {
    const deps = fixture();
    vi.mocked(deps.readState).mockRejectedValue(new Error('DB unavailable'));
    await expect(runArtifactGc(deps, { apply: true, now })).rejects.toThrow(
      'DB unavailable',
    );
    expect(deps.remove).not.toHaveBeenCalled();
    expect(deps.release).toHaveBeenCalledOnce();
  });
  it('does not release a fence it failed to acquire', async () => {
    const deps = fixture();
    vi.mocked(deps.acquire).mockRejectedValue(new Error('processing'));
    await expect(runArtifactGc(deps, { apply: true, now })).rejects.toThrow(
      'processing',
    );
    expect(deps.list).not.toHaveBeenCalled();
    expect(deps.release).not.toHaveBeenCalled();
  });
  it('reports failed deletions and preserves retirement for retry', async () => {
    const deps = fixture();
    vi.mocked(deps.remove).mockRejectedValue(new Error('R2 failure'));
    expect(await runArtifactGc(deps, { apply: true, now })).toMatchObject({
      failures: 1,
      deletedObjects: 0,
    });
    expect(deps.clearObservation).not.toHaveBeenCalledWith(video('old'));
  });
  it('is idempotent after the old objects are gone', async () => {
    const deps = fixture();
    await runArtifactGc(deps, { apply: true, now });
    vi.mocked(deps.list).mockResolvedValue([object(video('current'))]);
    await runArtifactGc(deps, { apply: true, now });
    expect(deps.remove).toHaveBeenCalledOnce();
  });
});
