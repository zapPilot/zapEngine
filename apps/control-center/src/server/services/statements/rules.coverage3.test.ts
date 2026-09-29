import { describe, expect, it } from 'vitest';
import {
  ruleR1,
  ruleR10,
  ruleR11,
  ruleR2,
  ruleR4,
  ruleR5,
  ruleR6,
} from './rules.js';
import type { StatementInputs } from './types.js';
const NOW = new Date('2026-09-17T07:42:00.000Z');

describe('rules coverage3', () => {
  it('R1 falls back when critical signal has no title', () => {
    const sig = { status: 'critical', evidence: {} };
    const f = ruleR1({
      operations: {
        signals: [sig],
        domains: [{ status: 'critical' }],
        priorities: [],
      },
      metricSeries: new Map(),
    } as unknown as StatementInputs);
    expect(
      f.segments.map((s) => ('text' in s ? s.text : s.value)).join(''),
    ).toContain('a critical signal');
  });

  it('R2 second provider wins and negative driver uses success tone', () => {
    const f = ruleR2({
      now: NOW,
      overview: {
        projectedCostUsd: 5,
        providers: [
          { provider: 'a', label: 'A', snapshot: { projectedCostUsd: 9 } },
          { provider: 'b', label: 'B', snapshot: { projectedCostUsd: 1 } },
        ],
      },
      costHistory: {
        previousMonthByProvider: [
          { provider: 'a', accruedCostUsd: 8 },
          { provider: 'b', accruedCostUsd: 10 },
        ],
      },
      metricSeries: new Map(),
    } as unknown as StatementInputs);
    // B delta -9 wins over A +1 by abs; negative driver -> success tone
    expect(
      f.segments.map((s) => ('text' in s ? s.text : s.value)).join(''),
    ).toContain('B is the driver');
  });

  it('R2 handles null previous and recorded-bill exclusion (no driver)', () => {
    const f = ruleR2({
      now: NOW,
      overview: {
        projectedCostUsd: 20,
        providers: [
          {
            provider: 'fly',
            label: 'Fly',
            snapshot: { projectedCostUsd: 20, source: 'manual' },
          },
        ],
      },
      costHistory: {
        previousMonthByProvider: [{ provider: 'fly', accruedCostUsd: 10 }],
      },
      metricSeries: new Map(),
    } as unknown as StatementInputs);
    expect(f.delta).toBeDefined();
    expect(f.fact?.note).not.toContain('driving');
  });

  it('R4 covers nulls, second-wins, negative and zero totals', () => {
    const nulls = ruleR4({
      socialGrowth: {
        platforms: [
          { platform: 'x', followersNow: null, followersDelta7d: null },
        ],
      },
      metricSeries: new Map(),
    } as unknown as StatementInputs);
    expect(nulls.value).toBe('—');

    const two = ruleR4({
      socialGrowth: {
        platforms: [
          {
            platform: 'x',
            followersNow: 10,
            followersDelta7d: 2,
            followersDelta24h: 0,
          },
          {
            platform: 'threads',
            followersNow: 20,
            followersDelta7d: 9,
            followersDelta24h: 1,
          },
        ],
      },
      metricSeries: new Map(),
    } as unknown as StatementInputs);
    expect(
      two.segments
        .map((s) => ('text' in s ? s.text : s.value))
        .join('')
        .toLowerCase(),
    ).toContain('threads');

    const neg = ruleR4({
      socialGrowth: {
        platforms: [
          {
            platform: 'x',
            followersNow: 90,
            followersDelta7d: -10,
            followersDelta24h: -1,
          },
        ],
      },
      metricSeries: new Map(),
    } as unknown as StatementInputs);
    expect(neg.deltaTone).toBe('bad');

    const zero = ruleR4({
      socialGrowth: {
        platforms: [
          {
            platform: 'x',
            followersNow: 100,
            followersDelta7d: 0,
            followersDelta24h: 0,
          },
        ],
      },
      metricSeries: new Map(),
    } as unknown as StatementInputs);
    expect(zero.delta).toContain('±0');
  });

  it('R5 winner without slot uses dot', () => {
    const f = ruleR5({
      socialPerformance: {
        decisions: [
          {
            platform: 'x',
            bestTopic: 'solo',
            bestTopicLiftVsPlatformMedian: 2.5,
            confidence: 'high',
            publishSlotsJst: null,
            bestTopicSamples: null,
          },
        ],
      },
    } as unknown as StatementInputs);
    expect(
      f.segments.map((s) => ('text' in s ? s.text : s.value)).join(''),
    ).toContain('.');
    expect(f.fact?.note).toContain('n=0');
  });

  it('R6 plural weeks and collecting', () => {
    const plural = ruleR6({
      product: { activePortfolios7d: 9, wau: 1, mau: 2, registeredUsers: 3 },
      metricSeries: new Map([
        [
          'active_portfolios_7d',
          {
            series: [1, 2, 3, 4, 5, 6, 7, 8],
            latest: 8,
            delta7d: 2,
            rowCount: 28,
          },
        ],
      ]),
    } as unknown as StatementInputs);
    expect(
      plural.segments.map((s) => ('text' in s ? s.text : s.value)).join(''),
    ).toContain('weeks');
  });

  it('R10 worst without stage and without elapsed, null share', () => {
    const f = ruleR10({
      now: NOW,
      podcastPipeline: {
        episodes: [
          {
            currentPhase: 'render',
            ingest: { status: 'failed', updatedAt: 'not-a-date' },
            visual: null,
            renders: [],
          },
        ],
      },
      podcastCosts: {
        episodes: [{ totalCostUsd: 0, failedAttemptCostUsd: 0 }],
      },
      metricSeries: new Map(),
    } as unknown as StatementInputs);
    expect(f.status).toBe('degraded');
  });

  it('R11 second overdue wins and Infinity fallback', () => {
    const f = ruleR11({
      operationsSocial: {
        jobs: [
          { overdueMinutes: 5, platform: 'x', languageCode: 'en' },
          { overdueMinutes: 50, platform: 'youtube', languageCode: null },
        ],
      },
    } as unknown as StatementInputs);
    expect(
      f.segments.map((s) => ('text' in s ? s.text : s.value)).join(''),
    ).toContain('youtube');

    const inf = ruleR11({
      operationsSocial: {
        jobs: [{ overdueMinutes: Number.POSITIVE_INFINITY, platform: 'x' }],
      },
    } as unknown as StatementInputs);
    expect(
      inf.segments.map((s) => ('text' in s ? s.text : s.value)).join(''),
    ).toContain('Infinity');
  });
});
