import { describe, expect, it } from 'vitest';

import { ARTIFACT_GRACE_MS, planArtifactGc } from './artifact-retention.js';
import type { StoredObject } from './r2-objects.js';

function storedObject(
  key: string,
  modified: Date | undefined,
  size = 10,
): StoredObject {
  return { key, size, modified };
}

const VIDEO_PREFIX = 'episodes/ep1/localizations/zh-Hant/video/v1/hash1';
const VIDEO_KEY = `${VIDEO_PREFIX}/video.mp4`;

describe('planArtifactGc coverage', () => {
  it('rejects a non-finite GC clock', () => {
    expect(() =>
      planArtifactGc({
        objects: [],
        references: new Set(),
        retirements: new Map(),
        now: Number.NaN,
      }),
    ).toThrow('Invalid GC clock');
  });

  it('skips objects that match no known artifact group', () => {
    const plan = planArtifactGc({
      objects: [
        storedObject('episodes/ep1/covers/v1/not-a-group.png', new Date()),
      ],
      references: new Set(),
      retirements: new Map(),
      now: Date.now(),
    });
    expect(plan).toEqual([]);
  });

  it('marks a referenced prefix as retained', () => {
    const now = Date.now();
    const plan = planArtifactGc({
      objects: [storedObject(VIDEO_KEY, new Date(now - ARTIFACT_GRACE_MS * 2))],
      references: new Set([VIDEO_PREFIX]),
      retirements: new Map(),
      now,
    });
    expect(plan).toHaveLength(1);
    expect(plan[0]?.decision).toBe('referenced');
  });

  it('marks a young prefix that is still inside the grace window', () => {
    const now = Date.now();
    const plan = planArtifactGc({
      objects: [storedObject(VIDEO_KEY, new Date(now - 1_000))],
      references: new Set(),
      retirements: new Map(),
      now,
    });
    expect(plan[0]?.decision).toBe('young');
  });

  it('marks an old unobserved prefix', () => {
    const now = Date.now();
    const plan = planArtifactGc({
      objects: [storedObject(VIDEO_KEY, new Date(now - ARTIFACT_GRACE_MS * 2))],
      references: new Set(),
      retirements: new Map(),
      now,
    });
    expect(plan[0]?.decision).toBe('unobserved');
  });
});
