import { describe, expect, it } from 'vitest';

import {
  resolveReleaseCohortLanes,
  resolveRequiredReleaseLanguages,
} from './cohort.js';

const AFTER_MULTILINGUAL = '2026-09-14T00:05:00.000Z';
const BEFORE_MULTILINGUAL = '2026-08-23T23:59:59.999Z';

describe('release cohort lanes', () => {
  it('gives every cohort the same fixed platform languages', () => {
    expect(resolveReleaseCohortLanes(AFTER_MULTILINGUAL)).toEqual([
      { platform: 'rednote', language: 'zh-Hant' },
      { platform: 'threads', language: 'zh-Hant' },
      { platform: 'x', language: 'ja' },
      { platform: 'youtube', language: 'en' },
    ]);
  });

  it('never tags a lane with language experiment metadata', () => {
    for (const lane of resolveReleaseCohortLanes(AFTER_MULTILINGUAL)) {
      expect(lane).not.toHaveProperty('experimentKey');
      expect(lane).not.toHaveProperty('experimentVariant');
    }
  });

  it('does not depend on when the cohort is scheduled', () => {
    expect(resolveReleaseCohortLanes('2026-08-24T00:00:00.000Z')).toEqual(
      resolveReleaseCohortLanes('2027-01-01T00:00:00.000Z'),
    );
  });

  it('leaves pre-multilingual episodes unpublishable', () => {
    expect(resolveReleaseCohortLanes(BEFORE_MULTILINGUAL)).toEqual([]);
    expect(resolveRequiredReleaseLanguages(BEFORE_MULTILINGUAL)).toEqual([]);
  });

  it('treats an unparseable creation date as unpublishable', () => {
    expect(resolveReleaseCohortLanes('not-a-date')).toEqual([]);
  });
});

describe('required release languages', () => {
  it('requires all three localizations before a slot is consumed', () => {
    expect(resolveRequiredReleaseLanguages(AFTER_MULTILINGUAL)).toEqual([
      'zh-Hant',
      'ja',
      'en',
    ]);
  });

  it('covers every language the fixed lanes ship', () => {
    const laneLanguages = new Set(
      resolveReleaseCohortLanes(AFTER_MULTILINGUAL).map(
        (lane) => lane.language,
      ),
    );
    const required = new Set(
      resolveRequiredReleaseLanguages(AFTER_MULTILINGUAL),
    );
    expect(required).toEqual(laneLanguages);
  });
});
