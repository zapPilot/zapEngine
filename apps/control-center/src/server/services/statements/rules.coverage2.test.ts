import { describe, expect, it } from 'vitest';
import {
  ruleR1,
  ruleR10,
  ruleR11,
  ruleR2,
  ruleR4,
  ruleR5,
  ruleR6,
  ruleR7,
  ruleR8,
} from './rules.js';
import type { StatementInputs } from './types.js';
import type { MetricSeries } from '../metric-snapshots.js';

const NOW = new Date('2026-09-17T07:42:00.000Z');
function series(delta7d: number | null, rowCount = 8): MetricSeries {
  return { series: [1, 2, 3, 4, 5, 6, 7, 8], latest: 8, delta7d, rowCount };
}

describe('rules coverage2', () => {
  it('covers platformLabel fallback via R4 other platform', () => {
    const finding = ruleR4({
      socialGrowth: {
        platforms: [
          {
            platform: 'bluesky',
            followersNow: 50,
            followersDelta7d: 5,
            followersDelta24h: 1,
          },
        ],
      },
      metricSeries: new Map([['followers_bluesky', series(2)]]),
    } as unknown as StatementInputs);
    expect(finding.deltaTone).toBe('good');
  });

  it('covers R4 negative delta tone', () => {
    const finding = ruleR4({
      socialGrowth: {
        platforms: [
          {
            platform: 'x',
            followersNow: 100,
            followersDelta7d: -4,
            followersDelta24h: -1,
          },
        ],
      },
      metricSeries: new Map([['followers_x', series(-3)]]),
    } as unknown as StatementInputs);
    expect(finding.deltaTone).toBe('bad');
  });

  it('covers R1 series tone both sides and unconfigured + elapsed', () => {
    const good = ruleR1({
      operations: {
        signals: [],
        domains: [{ status: 'healthy' }, { status: 'unknown' }],
        priorities: [],
      },
      metricSeries: new Map([['healthy_domains', series(1)]]),
    } as unknown as StatementInputs);
    expect(good.deltaTone).toBe('good');
    const bad = ruleR1({
      operations: {
        signals: [
          {
            status: 'critical',
            title: 'DB',
            evidence: { criticalSinceMinutes: 90 },
          },
        ],
        domains: [{ status: 'critical' }],
        priorities: [],
      },
      metricSeries: new Map([['healthy_domains', series(-2)]]),
    } as unknown as StatementInputs);
    expect(bad.deltaTone).toBe('bad');
    expect(
      bad.segments.map((s) => ('text' in s ? s.text : s.value)).join(''),
    ).toContain('(');
  });

  it('covers R2 driver reduce both sides and pct null baseline', () => {
    const finding = ruleR2({
      now: NOW,
      overview: {
        projectedCostUsd: 60.8,
        providers: [
          {
            provider: 'openrouter',
            label: 'OpenRouter',
            snapshot: { projectedCostUsd: 17.4 },
          },
          { provider: 'fly', label: 'Fly', snapshot: { projectedCostUsd: 5 } },
        ],
      },
      costHistory: {
        previousMonthByProvider: [
          { provider: 'openrouter', accruedCostUsd: 11.2 },
          { provider: 'fly', accruedCostUsd: 10 },
        ],
      },
      metricSeries: new Map([['usage_run_rate_usd', series(1)]]),
    } as unknown as StatementInputs);
    expect(finding.segments.length).toBeGreaterThan(0);

    const noBaseline = ruleR2({
      now: NOW,
      overview: {
        projectedCostUsd: 10,
        providers: [
          {
            provider: 'openrouter',
            label: 'O',
            snapshot: { projectedCostUsd: 10 },
          },
        ],
      },
      costHistory: { previousMonthByProvider: [] },
      metricSeries: new Map(),
    } as unknown as StatementInputs);
    expect(noBaseline.delta).toContain('collecting');
    expect(noBaseline.deltaTone).toBe('neutral');
  });

  it('covers R5 sort with two candidates and missing slot', () => {
    const finding = ruleR5({
      socialPerformance: {
        decisions: [
          {
            platform: 'x',
            bestTopic: 'a',
            bestTopicLiftVsPlatformMedian: 1.8,
            confidence: 'medium',
            publishSlotsJst: null,
            bestTopicSamples: 3,
          },
          {
            platform: 'youtube',
            bestTopic: 'b',
            bestTopicLiftVsPlatformMedian: 3.1,
            confidence: 'high',
            publishSlotsJst: 'Fri 20:00 JST',
            bestTopicSamples: 8,
          },
        ],
      },
    } as unknown as StatementInputs);
    expect(finding.fact?.value).toContain('b: 3.1');
  });

  it('covers R6 flat and down', () => {
    const flatEntry: MetricSeries = {
      series: [9, 9, 9, 9, 9, 9, 9, 9, 9],
      latest: 9,
      delta7d: 0,
      rowCount: 28,
    };
    const flat = ruleR6({
      product: { activePortfolios7d: 9, wau: 1, mau: 2, registeredUsers: 3 },
      metricSeries: new Map([['active_portfolios_7d', flatEntry]]),
    } as unknown as StatementInputs);
    expect(flat.deltaTone).toBe('good');
    const down = ruleR6({
      product: { activePortfolios7d: 5, wau: 1, mau: 2, registeredUsers: 3 },
      metricSeries: new Map([['active_portfolios_7d', series(-5, 8)]]),
    } as unknown as StatementInputs);
    expect(down.deltaTone).toBe('bad');
  });

  it('covers R7 prior ratio rise and fall', () => {
    const base = { product: { portfolioFresh24h: 10, portfolioUsers: 20 } };
    const mk = (freshPrior: number, obsPrior: number) =>
      new Map([
        [
          'fresh_24h',
          {
            series: [freshPrior, 1, 1, 1, 1, 1, 1, 1],
            latest: 1,
            delta7d: 0,
            rowCount: 9,
          } as MetricSeries,
        ],
        [
          'observed_portfolios',
          {
            series: [obsPrior, 20, 20, 20, 20, 20, 20, 20],
            latest: 20,
            delta7d: 0,
            rowCount: 9,
          } as MetricSeries,
        ],
      ]);
    const fell = ruleR7({
      ...base,
      metricSeries: mk(18, 20),
    } as unknown as StatementInputs);
    expect(fell.delta).toContain('was');
    const rose = ruleR7({
      ...base,
      metricSeries: mk(5, 20),
    } as unknown as StatementInputs);
    expect(rose.delta).toContain('was');
    const nullUsers = ruleR7({
      product: { portfolioFresh24h: null, portfolioUsers: 0 },
      metricSeries: new Map(),
    } as unknown as StatementInputs);
    expect(nullUsers.value).toBe('—');
  });

  it('covers R8 null inactiveDays and null cost', () => {
    const finding = ruleR8({
      customers: {
        summary: { inactiveButPriority: 1 },
        users: [
          {
            effectiveTier: 'priority',
            inactiveDays: null,
            attributedCostUsd30d: null,
          },
        ],
      },
    } as unknown as StatementInputs);
    expect(finding.status).toBe('degraded');
    expect(finding.fact?.note).toContain('no attributable');
  });

  it('covers R10 series and avg null paths', () => {
    const finding = ruleR10({
      now: NOW,
      podcastPipeline: { episodes: [] },
      podcastCosts: { episodes: [] },
      metricSeries: new Map([['episodes_in_production', series(1)]]),
    } as unknown as StatementInputs);
    expect(finding.series).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('covers R11 empty and overdue', () => {
    const empty = ruleR11({
      operationsSocial: { jobs: [] },
    } as unknown as StatementInputs);
    expect(empty.segments).toEqual([]);
    const overdue = ruleR11({
      operationsSocial: { jobs: [{ overdueMinutes: 5, title: 't' }] },
    } as unknown as StatementInputs);
    expect(overdue.status).toBe('degraded');
  });
});
