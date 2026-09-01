import { describe, expect, it } from 'vitest';

import {
  languageRotationProfileForLane,
  languageRotationProfileForSlot,
  rotatingReleaseCohortLanes,
  rotatingReleaseCohortLanesForProfile,
} from './language-allocation.js';

function slot(day: number, hourUtc: number, minute = 0): Date {
  return new Date(Date.UTC(2026, 8, day, hourUtc, minute));
}

function languageByPlatform(date: Date): Record<string, string> {
  return Object.fromEntries(
    rotatingReleaseCohortLanes(date).map((lane) => [
      lane.platform,
      lane.language,
    ]),
  );
}

describe('social language Latin square', () => {
  it('rotates A/B/C across the three article slots and shifts once per JST day', () => {
    const day1 = [
      slot(2, 0, 30), // 09:30 JST
      slot(2, 3), // 12:00 JST
      slot(2, 7), // 16:00 JST
    ].map((date) => languageRotationProfileForSlot(date).profile);
    const day2 = [slot(3, 0, 30), slot(3, 3), slot(3, 7)].map(
      (date) => languageRotationProfileForSlot(date).profile,
    );
    const day3 = [slot(4, 0, 30), slot(4, 3), slot(4, 7)].map(
      (date) => languageRotationProfileForSlot(date).profile,
    );

    expect(day1).toEqual(['A', 'B', 'C']);
    expect(day2).toEqual(['B', 'C', 'A']);
    expect(day3).toEqual(['C', 'A', 'B']);
  });

  it('covers zh-Hant, ja, and en on every article while Rednote stays zh-Hant', () => {
    for (const date of [slot(2, 0, 30), slot(2, 3), slot(2, 7)]) {
      const lanes = rotatingReleaseCohortLanes(date);
      expect(lanes).toHaveLength(4);
      expect(lanes.find((lane) => lane.platform === 'rednote')?.language).toBe(
        'zh-Hant',
      );
      expect(new Set(lanes.map((lane) => lane.language))).toEqual(
        new Set(['zh-Hant', 'ja', 'en']),
      );
    }
  });

  it('gives each rotating platform every language exactly once per JST day', () => {
    const allocations = [slot(2, 0, 30), slot(2, 3), slot(2, 7)].map(
      languageByPlatform,
    );
    for (const platform of ['x', 'threads', 'youtube']) {
      expect(new Set(allocations.map((row) => row[platform]))).toEqual(
        new Set(['zh-Hant', 'ja', 'en']),
      );
    }
  });

  it('records platform-specific language experiment memberships', () => {
    const lanes = rotatingReleaseCohortLanes(slot(2, 0, 30));
    expect(lanes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          platform: 'x',
          language: 'en',
          experimentKey: 'x-language-v2',
          experimentVariant: 'en',
        }),
        expect.objectContaining({
          platform: 'threads',
          language: 'ja',
          experimentKey: 'threads-language-v1',
          experimentVariant: 'ja',
        }),
        expect.objectContaining({
          platform: 'youtube',
          language: 'zh-Hant',
          experimentKey: 'youtube-language-v1',
          experimentVariant: 'zh-Hant',
        }),
      ]),
    );
  });

  it('persists a rotating experiment marker before the generation-ambiguous Rednote lane', () => {
    const lanes = rotatingReleaseCohortLanes(slot(2, 0, 30));
    expect(lanes[0]).toMatchObject({
      platform: 'x',
      experimentKey: 'x-language-v2',
      experimentVariant: 'en',
    });
    expect(lanes.at(-1)).toEqual({ platform: 'rednote', language: 'zh-Hant' });
  });

  it('can reconstruct the original profile from any persisted rotating lane', () => {
    for (const profile of ['A', 'B', 'C'] as const) {
      const lanes = rotatingReleaseCohortLanesForProfile(profile);
      for (const lane of lanes.filter(
        (candidate) => candidate.platform !== 'rednote',
      )) {
        expect(
          languageRotationProfileForLane(lane.platform, lane.language),
        ).toBe(profile);
      }
    }
  });

  it('fails closed if a caller tries to allocate a non-release time', () => {
    expect(() => languageRotationProfileForSlot(slot(2, 1))).toThrow(
      /configured article slot/u,
    );
  });
});
