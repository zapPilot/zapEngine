import { describe, expect, it } from 'vitest';

import {
  channelsForLanguage,
  coverageDays,
  formatCount,
  formatSnapshotDate,
  getDistributionSnapshot,
  languageLabel,
  platformLabel,
} from '../distribution';

/**
 * Guards the committed `distribution-snapshot.json` against the shape this
 * workspace declares for it. The refresh workflow runs this suite before it
 * commits, which is the only gate between a bad regeneration and a public page
 * showing wrong numbers, because a bot push does not trigger CI.
 */

const KNOWN_PLATFORMS = ['x', 'threads', 'rednote', 'youtube'];
const KNOWN_LANGUAGES = ['zh-Hant', 'ja', 'en'];
const ISO = /^\d{4}-\d{2}-\d{2}T/;

describe('committed distribution snapshot', () => {
  const snapshot = getDistributionSnapshot();

  it('is keyed to an ISO instant', () => {
    expect(snapshot.asOf).toMatch(ISO);
  });

  it('describes a corpus that has actually published', () => {
    expect(snapshot.funnel.articles).toBeGreaterThan(0);
    expect(snapshot.funnel.localizations).toBeGreaterThan(0);
    expect(snapshot.funnel.videos).toBeGreaterThan(0);
    expect(snapshot.funnel.posts).toBeGreaterThan(0);
    expect(snapshot.funnel.platforms).toBeGreaterThan(0);
    expect(snapshot.channels.length).toBeGreaterThan(0);
    expect(snapshot.languages.length).toBeGreaterThan(0);
  });

  it('adds channel posts and reach up to the funnel', () => {
    const posts = snapshot.channels.reduce(
      (sum, channel) => sum + channel.posts,
      0,
    );
    const reach = snapshot.channels.reduce(
      (sum, channel) => sum + channel.reach,
      0,
    );

    expect(posts).toBe(snapshot.funnel.posts);
    expect(reach).toBe(snapshot.funnel.reach);
  });

  it('adds per-language localizations up to the funnel', () => {
    const localizations = snapshot.languages.reduce(
      (sum, language) => sum + language.localizations,
      0,
    );

    expect(localizations).toBe(snapshot.funnel.localizations);
  });

  it('counts distinct channel platforms as the funnel platform count', () => {
    const platforms = new Set(
      snapshot.channels.map((channel) => channel.platform),
    );

    expect(platforms.size).toBe(snapshot.funnel.platforms);
  });

  it('only names platforms and languages the page can label', () => {
    for (const channel of snapshot.channels) {
      expect(KNOWN_PLATFORMS).toContain(channel.platform);
      expect(KNOWN_LANGUAGES).toContain(channel.language);
    }
    for (const language of snapshot.languages) {
      expect(KNOWN_LANGUAGES).toContain(language.code);
    }
  });

  it('never reports more measured posts than posts', () => {
    for (const channel of snapshot.channels) {
      expect(channel.postsWithMetrics).toBeLessThanOrEqual(channel.posts);
      expect(channel.reach).toBeGreaterThanOrEqual(0);
    }
  });

  it('never reports more audio tracks than localizations', () => {
    for (const language of snapshot.languages) {
      expect(language.mainAudio).toBeLessThanOrEqual(language.localizations);
      expect(language.classroomAudio).toBeLessThanOrEqual(
        language.localizations,
      );
    }
  });

  it('keeps publish-job outcomes within the job total', () => {
    const { reliability } = snapshot;
    expect(
      reliability.publishJobsCompleted + reliability.publishJobsFailed,
    ).toBeLessThanOrEqual(reliability.publishJobs);
    expect(reliability.metricSnapshotsCollected).toBeLessThanOrEqual(
      reliability.metricSnapshots,
    );
  });

  it('bounds the coverage window in order', () => {
    const { firstEpisodeAt, lastEpisodeAt } = snapshot.coverage;
    expect(firstEpisodeAt).toMatch(ISO);
    expect(lastEpisodeAt).toMatch(ISO);
    expect(String(firstEpisodeAt) <= String(lastEpisodeAt)).toBe(true);
  });

  it('carries a worked example whose chain the page can render', () => {
    const { example } = snapshot;
    expect(example).not.toBeNull();
    if (!example) return;

    expect(example.sourceUrl).toMatch(/^https?:\/\//);
    expect(example.channels.length).toBeGreaterThan(0);
    expect(example.posts).toBe(example.channels.length);
    for (const channel of example.channels) {
      expect(KNOWN_PLATFORMS).toContain(channel.platform);
      expect(KNOWN_LANGUAGES).toContain(channel.language);
    }
  });
});

describe('distribution accessors', () => {
  const snapshot = getDistributionSnapshot();

  it('labels every platform and language it will be handed', () => {
    expect(platformLabel('x')).toBe('X');
    expect(platformLabel('youtube')).toBe('YouTube');
    expect(languageLabel('zh-Hant')).toBe('Chinese');
    expect(languageLabel('ja')).toBe('Japanese');
  });

  it('falls back to the raw value for a label it does not know', () => {
    expect(platformLabel('bluesky')).toBe('bluesky');
    expect(languageLabel('ko')).toBe('ko');
  });

  it('groups thousands', () => {
    expect(formatCount(9199)).toBe('9,199');
    expect(formatCount(7)).toBe('7');
  });

  it('renders a snapshot date at day precision', () => {
    expect(formatSnapshotDate('2026-08-27T08:06:11.508+00:00')).toBe(
      '2026-08-27',
    );
  });

  it('reports a missing or unreadable date rather than throwing', () => {
    expect(formatSnapshotDate(null)).toBe('not yet');
    expect(formatSnapshotDate('never')).toBe('not yet');
  });

  it('measures the coverage window in whole days', () => {
    const days = coverageDays(snapshot);
    expect(days).not.toBeNull();
    expect(days).toBeGreaterThan(0);
  });

  it('has no coverage window without episodes', () => {
    expect(
      coverageDays({
        ...snapshot,
        coverage: {
          firstEpisodeAt: null,
          lastEpisodeAt: null,
          firstPostAt: null,
          lastPostAt: null,
        },
      }),
    ).toBeNull();
  });

  it('selects only the channels for one language', () => {
    const channels = channelsForLanguage(snapshot, 'ja');
    expect(channels.length).toBeGreaterThan(0);
    for (const channel of channels) {
      expect(channel.language).toBe('ja');
    }
    expect(channelsForLanguage(snapshot, 'ko')).toEqual([]);
  });
});
