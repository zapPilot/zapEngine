import { describe, expect, it } from 'vitest';
import {
  buildPlaybackSections,
  findPlaybackSection,
  nextPlaybackSection,
  parseStoredSpeedPreferences,
  resolveFinishedPlayback,
  speedForSection,
  withSectionSpeed,
} from '../src/integration/podcastSections';
import {
  hasUsableAttribution,
  summarizeRangeAttribution,
} from '../src/integration/rangeAttribution';
import {
  investDoneStatusLabel,
  queueTone,
  reviewExpiryKey,
  reviewGroupBlocked,
  riskAcknowledgement,
  sameReviewFingerprints,
} from '../src/integration/investReviewModel';

const review = (overrides: Record<string, unknown> = {}) =>
  ({
    blocked: false,
    executionAllowed: true,
    status: 'ready',
    expiresAt: 200,
    groupId: 'g',
    groupFingerprint: 'gf',
    batchFingerprint: 'bf',
    expectedSimulationFingerprint: 'sf',
    expectedRiskHash: 'rh',
    requiresRiskAcknowledgement: false,
    ...overrides,
  }) as never;

describe('coverage handoff: podcast section boundaries', () => {
  it('selects the matching language track and de-duplicates classroom languages', () => {
    const sections = buildPlaybackSections({
      hlsUrl: 'main',
      languageCode: 'en',
      audioTracks: [
        { languageCode: 'ja', hlsUrl: 'other', classrooms: [] },
        {
          languageCode: 'en',
          hlsUrl: 'selected',
          classrooms: [
            { languageCode: 'ja', hlsUrl: ' ja ' },
            { languageCode: 'ja', hlsUrl: 'duplicate' },
            { languageCode: 'en', hlsUrl: ' ' },
          ],
        },
      ],
    } as never);
    expect(sections).toEqual([
      { kind: 'main', hlsUrl: 'main', languageCode: null },
      { kind: 'classroom', hlsUrl: ' ja ', languageCode: 'ja' },
    ]);
  });

  it('uses the legacy combined classroom fallback and supports lookup misses', () => {
    const sections = buildPlaybackSections({
      hlsUrl: 'main',
      languageCode: 'en',
      audioTracks: [{ languageCode: 'en', classroomHlsUrl: 'legacy' }],
    } as never);
    expect(sections.at(-1)).toEqual({
      kind: 'classroom',
      hlsUrl: 'legacy',
      languageCode: null,
    });
    expect(nextPlaybackSection(sections, 'classroom')).toBeNull();
    expect(findPlaybackSection(sections, 'classroom', 'missing')).toEqual(
      sections[1],
    );
  });

  it('prioritizes section advance, then episode advance, then stop', () => {
    const sections = [
      { kind: 'main', hlsUrl: 'main', languageCode: null },
      { kind: 'classroom', hlsUrl: 'lesson', languageCode: 'ja' },
    ] as const;
    expect(
      resolveFinishedPlayback({
        sections,
        currentSection: 'main',
        queue: [] as never,
        queueIndex: 0,
      }).type,
    ).toBe('playSection');
    expect(
      resolveFinishedPlayback({
        sections: sections.slice(0, 1),
        currentSection: 'main',
        queue: [{ id: 'a' }, { id: 'b' }] as never,
        queueIndex: 0,
      }).type,
    ).toBe('nextEpisode');
    expect(
      resolveFinishedPlayback({
        sections: sections.slice(0, 1),
        currentSection: 'main',
        queue: [{ id: 'a' }] as never,
        queueIndex: 0,
      }).type,
    ).toBe('stop');
  });

  it('normalizes corrupt and out-of-range speed preferences', () => {
    expect(parseStoredSpeedPreferences('{')).toEqual({
      mainSpeed: 1,
      classroomSpeed: 1,
    });
    expect(
      parseStoredSpeedPreferences(
        JSON.stringify({ mainSpeed: 99, classroomSpeed: -1 }),
      ),
    ).toEqual({ mainSpeed: 3, classroomSpeed: 1 });
    const next = withSectionSpeed(
      { mainSpeed: 1, classroomSpeed: 1 },
      'classroom',
      2,
    );
    expect(speedForSection(next, 'classroom')).toBe(2);
    expect(speedForSection(next, 'main')).toBe(1);
  });
});

describe('coverage handoff: attribution and review boundaries', () => {
  it('requires at least half the eligible days to carry attribution', () => {
    expect(
      hasUsableAttribution({ totalDays: 0, attributedDays: 0 } as never),
    ).toBe(false);
    expect(
      hasUsableAttribution({ totalDays: 2, attributedDays: 1 } as never),
    ).toBe(true);
  });

  it('separates market, protocol, flow, and unexplained changes', () => {
    expect(summarizeRangeAttribution([])).toBeNull();
    expect(
      summarizeRangeAttribution([
        { total_value_usd: 100 },
        {
          total_value_usd: 120,
          attribution: [
            { kind: 'market', label: 'BTC', valueUsd: 10 },
            { kind: 'protocol', label: 'Aave', valueUsd: -2 },
            { kind: 'flow', label: 'USDC', valueUsd: 5 },
            { kind: 'residual', valueUsd: 7 },
          ],
        },
      ]),
    ).toMatchObject({
      netChangeUsd: 20,
      marketUsd: 10,
      protocolUsd: -2,
      flowUsd: 5,
      otherUsd: 7,
      gainsUsd: 10,
      lossesUsd: -2,
    });
  });

  it('covers each independent review blocking and fingerprint condition', () => {
    expect(reviewGroupBlocked(review({ blocked: true }), 100)).toBe(true);
    expect(reviewGroupBlocked(review({ executionAllowed: false }), 100)).toBe(
      true,
    );
    expect(reviewGroupBlocked(review({ status: 'failed' }), 100)).toBe(true);
    expect(reviewGroupBlocked(review({ expiresAt: 100 }), 100)).toBe(true);
    expect(reviewGroupBlocked(review(), 100)).toBe(false);
    expect(sameReviewFingerprints(review(), review())).toBe(true);
    expect(
      sameReviewFingerprints(review(), review({ expectedRiskHash: 'changed' })),
    ).toBe(false);
  });

  it('formats review queue and completion fallbacks', () => {
    expect(riskAcknowledgement(review())).toEqual({});
    expect(
      riskAcknowledgement(review({ requiresRiskAcknowledgement: true })),
    ).toEqual({ acknowledgedRiskHash: 'rh' });
    expect(
      reviewExpiryKey([review(), review({ groupId: 'b', expiresAt: 300 })]),
    ).toBe('g:200|b:300');
    expect(queueTone({ index: 0, currentIndex: 1, phase: undefined })).toBe(
      'done',
    );
    expect(queueTone({ index: 2, currentIndex: 1, phase: undefined })).toBe(
      'waiting',
    );
    expect(queueTone({ index: 1, currentIndex: 1, phase: 'failed' })).toBe(
      'failed',
    );
    expect(queueTone({ index: 1, currentIndex: 1, phase: 'checkpoint' })).toBe(
      'done',
    );
    expect(
      queueTone({ index: 1, currentIndex: 1, phase: 'submitting' as never }),
    ).toBe('active');
    expect(
      investDoneStatusLabel({
        drafts: [],
        hasHyperCoreLeg: false,
        hlpDeposited: false,
      }),
    ).toBe('Route complete');
  });
});
