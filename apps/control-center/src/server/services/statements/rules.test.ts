import { describe, expect, it } from 'vitest';

import type { MetricSeries } from '../metric-snapshots.js';
import {
  combineSegments,
  numericEvidence,
  ruleR1,
  ruleR10,
  ruleR11,
  ruleR2,
  ruleR3,
  ruleR4,
  ruleR6,
  ruleR7,
  ruleR8,
  ruleR9,
  sumKnown,
} from './rules.js';
import type { RuleFinding, StatementInputs } from './types.js';

const NOW = new Date('2026-09-17T07:42:00.000Z');

function sentence(finding: RuleFinding): string {
  return finding.segments
    .map((segment) => ('text' in segment ? segment.text : segment.value))
    .join('');
}

describe('ruleR1', () => {
  it('names the critical signal', () => {
    const signal = {
      status: 'critical',
      title: 'DB down',
      evidence: {},
    };
    const finding = ruleR1({
      operations: {
        signals: [signal],
        domains: [{ status: 'critical' }],
        priorities: [{ signal }],
      },
      metricSeries: new Map(),
    } as unknown as StatementInputs);

    expect(finding.status).toBe('critical');
    expect(finding.value).toBe('1 critical');
    expect(sentence(finding)).toBe('1 critical: DB down.');
  });

  it('reports degraded when nothing is critical', () => {
    const finding = ruleR1({
      operations: {
        signals: [{ status: 'degraded' }],
        domains: [{ status: 'healthy' }],
        priorities: [],
      },
      metricSeries: new Map(),
    } as unknown as StatementInputs);

    expect(finding.status).toBe('degraded');
    expect(sentence(finding)).toBe('1 degraded, nothing critical.');
  });

  it('calls all-healthy explicitly healthy', () => {
    const finding = ruleR1({
      operations: {
        signals: [],
        domains: [{ status: 'healthy' }, { status: 'healthy' }],
        priorities: [],
      },
      metricSeries: new Map(),
    } as unknown as StatementInputs);

    expect(finding.status).toBe('healthy');
    expect(sentence(finding)).toBe('All 2 domains healthy.');
  });
});

describe('ruleR2', () => {
  const priced = {
    projectedCostUsd: 60.8,
    providers: [
      {
        provider: 'openrouter',
        label: 'OpenRouter',
        snapshot: { projectedCostUsd: 17.4, source: 'api' },
      },
    ],
  };
  const history = {
    previousMonthByProvider: [{ provider: 'openrouter', accruedCostUsd: 11.2 }],
  };

  it('flags a rising month and names the driver', () => {
    const finding = ruleR2({
      now: NOW,
      overview: priced,
      costHistory: history,
      metricSeries: new Map(),
    } as unknown as StatementInputs);

    expect(finding.status).toBe('degraded');
    expect(sentence(finding)).toContain('September is pacing to $60.80');
    expect(sentence(finding)).toContain('OpenRouter is the driver');
    expect(finding.delta).toBe('+443% · MoM');
    expect(finding.deltaTone).toBe('bad');
  });

  it('reads a near-flat month as healthy', () => {
    const finding = ruleR2({
      now: NOW,
      overview: { ...priced, projectedCostUsd: 11.5 },
      costHistory: history,
      metricSeries: new Map(),
    } as unknown as StatementInputs);

    expect(finding.status).toBe('healthy');
    expect(sentence(finding)).toContain(', flat vs August.');
    expect(finding.deltaTone).toBe('neutral');
  });
});

describe('ruleR3', () => {
  it('fires when cash dwarfs accrued spend', () => {
    const finding = ruleR3({
      overview: { cashInvoiceSpendUsd: 300, accruedCostUsd: 50 },
    } as unknown as StatementInputs);

    expect(sentence(finding)).toBe(
      'Cash spend $300.00 is prepaid units, not consumption.',
    );
    expect(finding.fact?.value).toBe('$300.00');
  });

  it('stays silent when cash tracks accrual', () => {
    const finding = ruleR3({
      overview: { cashInvoiceSpendUsd: 100, accruedCostUsd: 50 },
    } as unknown as StatementInputs);

    expect(finding.segments).toEqual([]);
    expect(finding.fact).toBeNull();
  });
});

describe('ruleR4', () => {
  it('attributes growth to the dominant platform', () => {
    const finding = ruleR4({
      socialGrowth: {
        platforms: [
          {
            platform: 'x',
            followersNow: 100,
            followersDelta7d: 10,
            followersDelta24h: 2,
          },
        ],
      },
      metricSeries: new Map(),
    } as unknown as StatementInputs);

    expect(sentence(finding)).toBe(
      'Audience +10 this week (+11.1%), 100% of it on X.',
    );
    expect(finding.value).toBe('100');
    expect(finding.delta).toBe('+10 · 7d');
    expect(finding.deltaTone).toBe('good');
  });

  it('admits no driver when nothing moves', () => {
    const finding = ruleR4({
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

    expect(sentence(finding)).toContain('no single platform');
    expect(sentence(finding)).toContain('driving net growth.');
  });
});

describe('ruleR6', () => {
  const product = {
    activePortfolios7d: 9,
    wau: 12,
    mau: 31,
    registeredUsers: 87,
  };

  it('reports collecting before history exists', () => {
    const finding = ruleR6({
      product,
      metricSeries: new Map(),
    } as unknown as StatementInputs);

    expect(finding.value).toBe('9');
    expect(finding.delta).toBe('collecting (0/7)');
  });

  it('reads a real trend once history exists', () => {
    const entry: MetricSeries = {
      series: [6, 7, 7, 8, 8, 9, 9, 9],
      latest: 9,
      delta7d: 3,
      rowCount: 8,
    };
    const finding = ruleR6({
      product,
      metricSeries: new Map([['active_portfolios_7d', entry]]),
    } as unknown as StatementInputs);

    expect(finding.series).toEqual([6, 7, 7, 8, 8, 9, 9, 9]);
    expect(finding.delta).toBe('+3 · 7d');
    expect(finding.deltaTone).toBe('good');
    expect(sentence(finding)).toContain('trending up over the last 1 week.');
  });
});

describe('ruleR7', () => {
  it('fires when freshness drops under 80%', () => {
    const finding = ruleR7({
      product: { portfolioFresh24h: 10, portfolioUsers: 20 },
      metricSeries: new Map(),
    } as unknown as StatementInputs);

    expect(finding.status).toBe('degraded');
    expect(finding.value).toBe('50%');
    expect(finding.delta).toBe('no prior reading');
    expect(finding.deltaTone).toBe('bad');
  });

  it('stays healthy when freshness holds', () => {
    const finding = ruleR7({
      product: { portfolioFresh24h: 19, portfolioUsers: 20 },
      metricSeries: new Map(),
    } as unknown as StatementInputs);

    expect(finding.status).toBe('healthy');
    expect(finding.segments).toEqual([]);
    expect(finding.value).toBe('95%');
    expect(finding.deltaTone).toBe('good');
  });
});

describe('ruleR8', () => {
  it('fires on idle priority accounts and prices the waste', () => {
    const finding = ruleR8({
      customers: {
        summary: { inactiveButPriority: 2 },
        users: [
          {
            effectiveTier: 'priority',
            inactiveDays: 45,
            attributedCostUsd30d: 1.5,
          },
          {
            effectiveTier: 'standard',
            inactiveDays: 100,
            attributedCostUsd30d: 9,
          },
        ],
      },
    } as unknown as StatementInputs);

    expect(finding.status).toBe('degraded');
    expect(sentence(finding)).toBe(
      '2 priority accounts have not opened the app in 30 days ($1.50/mo).',
    );
    expect(finding.value).toBe('2');
  });

  it('stays silent when every priority account is active', () => {
    const finding = ruleR8({
      customers: {
        summary: { inactiveButPriority: 0 },
        users: [],
      },
    } as unknown as StatementInputs);

    expect(finding.status).toBe('healthy');
    expect(finding.segments).toEqual([]);
    expect(finding.value).toBe('0');
  });
});

describe('ruleR9', () => {
  it('fires when one wallet holds over a third of AUM', () => {
    const finding = ruleR9({
      product: { top1PortfolioShare: 0.42 },
    } as unknown as StatementInputs);

    expect(sentence(finding)).toBe(
      'Top wallet holds 42% of AUM — AUM moves with one customer.',
    );
    expect(finding.value).toBe('42%');
    expect(finding.fact).toEqual({
      kicker: 'Because · concentration',
      value: 'Top wallet 42%',
      note: 'AUM is context, not a growth metric',
    });
  });

  it('stays out of the sentence when concentration is low', () => {
    const finding = ruleR9({
      product: { top1PortfolioShare: 0.1 },
    } as unknown as StatementInputs);

    expect(finding.segments).toEqual([]);
    expect(finding.value).toBe('10%');
  });
});

describe('ruleR10', () => {
  it('reads an empty pipeline as healthy with no priced episodes', () => {
    const finding = ruleR10({
      now: NOW,
      podcastPipeline: { episodes: [] },
      podcastCosts: { episodes: [] },
      metricSeries: new Map(),
    } as unknown as StatementInputs);

    expect(finding.status).toBe('healthy');
    expect(sentence(finding)).toBe('0 in production; nothing stuck.');
    expect(finding.value).toBe('—');
  });

  it('flags a stuck episode with its stage and age', () => {
    const finding = ruleR10({
      now: NOW,
      podcastPipeline: {
        episodes: [
          {
            currentPhase: 'render',
            ingest: {
              status: 'failed',
              stage: 'download',
              updatedAt: '2026-09-17T07:00:00.000Z',
            },
            visual: null,
            renders: [],
          },
        ],
      },
      podcastCosts: { episodes: [] },
      metricSeries: new Map(),
    } as unknown as StatementInputs);

    expect(finding.status).toBe('degraded');
    expect(sentence(finding)).toContain('1 in production');
    expect(sentence(finding)).toContain('1 episode needs attention');
    expect(sentence(finding)).toContain('(stuck at download for 42m).');
  });

  it('reports average cost and failed-attempt share once episodes are priced', () => {
    const finding = ruleR10({
      now: NOW,
      podcastPipeline: { episodes: [] },
      podcastCosts: {
        episodes: [
          {
            totalCostUsd: 10,
            runCount: 2,
            failedAttemptCostUsd: 1,
            confirmedRetryWasteUsd: null,
            confirmedRetryWasteIsLowerBound: true,
          },
        ],
      },
      metricSeries: new Map(),
    } as unknown as StatementInputs);

    expect(finding.value).toBe('$10.00');
    expect(sentence(finding)).toContain('Average episode $10.00');
    expect(sentence(finding)).toContain('failed attempts are 10% of that');
    expect(sentence(finding)).toContain(
      'confirmed retry waste unknown (no render lineage).',
    );
  });

  it('marks partial lineage as a floor rather than an exact figure', () => {
    const finding = ruleR10({
      now: NOW,
      podcastPipeline: { episodes: [] },
      podcastCosts: {
        episodes: [
          {
            totalCostUsd: 10,
            runCount: 2,
            failedAttemptCostUsd: 1,
            confirmedRetryWasteUsd: 0.25,
            confirmedRetryWasteIsLowerBound: true,
          },
        ],
      },
      metricSeries: new Map(),
    } as unknown as StatementInputs);

    expect(sentence(finding)).toContain(
      'confirmed retry waste at least $0.25.',
    );
  });

  it('states an exact figure once every priced render stage has lineage', () => {
    const finding = ruleR10({
      now: NOW,
      podcastPipeline: { episodes: [] },
      podcastCosts: {
        episodes: [
          {
            totalCostUsd: 10,
            runCount: 2,
            failedAttemptCostUsd: 1,
            confirmedRetryWasteUsd: 0.25,
            confirmedRetryWasteIsLowerBound: false,
          },
        ],
      },
      metricSeries: new Map(),
    } as unknown as StatementInputs);

    expect(sentence(finding)).toContain('confirmed retry waste $0.25.');
  });
});

describe('ruleR11', () => {
  it('fires on overdue publish jobs and names the worst lane', () => {
    const finding = ruleR11({
      operationsSocial: {
        jobs: [
          { overdueMinutes: 90, platform: 'x', languageCode: 'ja' },
          { overdueMinutes: 10, platform: 'threads', languageCode: null },
        ],
      },
    } as unknown as StatementInputs);

    expect(finding.status).toBe('degraded');
    expect(sentence(finding)).toContain('2 publish jobs');
    expect(sentence(finding)).toContain('1h 30m overdue (x · ja).');
    expect(finding.value).toBe('2');
    expect(finding.fact).toEqual({
      kicker: 'Because · queue',
      value: '2 overdue',
      note: 'worst: 90m',
    });
  });

  it('stays silent when the queue is current', () => {
    const finding = ruleR11({
      operationsSocial: { jobs: [{ overdueMinutes: null }] },
    } as unknown as StatementInputs);

    expect(finding.status).toBe('healthy');
    expect(finding.segments).toEqual([]);
    expect(finding.value).toBe('0');
  });
});

describe('combineSegments', () => {
  function finding(id: string, texts: string[]): RuleFinding {
    return {
      id,
      status: 'healthy',
      segments: texts.map((text) => ({ text })),
      fact: null,
      series: [],
      value: null,
      delta: null,
      deltaTone: 'neutral',
    };
  }

  it('joins sentences with a single space', () => {
    expect(combineSegments(finding('a', ['a']), finding('b', ['b']))).toEqual([
      { text: 'a' },
      { text: ' ' },
      { text: 'b' },
    ]);
  });

  it('skips findings with nothing to say', () => {
    expect(combineSegments(finding('a', ['a']), finding('b', []))).toEqual([
      { text: 'a' },
    ]);
  });
});

describe('rule helpers', () => {
  it('numericEvidence keeps only finite numbers', () => {
    expect(numericEvidence(5)).toBe(5);
    expect(numericEvidence('5')).toBeNull();
    expect(numericEvidence(Number.NaN)).toBeNull();
  });

  it('sumKnown ignores unknowns but never invents zero', () => {
    expect(sumKnown([1, null, 2])).toBe(3);
    expect(sumKnown([null])).toBeNull();
    expect(sumKnown([])).toBeNull();
  });
});

function series(delta7d: number | null, rowCount = 8): MetricSeries {
  return { series: [1, 2, 3, 4, 5, 6, 7, 8], latest: 8, delta7d, rowCount };
}

describe('narrative direction and attribution', () => {
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
    expect(sentence(finding)).toContain('OpenRouter');

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
    expect(sentence(flat)).toBe('9 active portfolios, flat for 4 weeks.');
    const down = ruleR6({
      product: { activePortfolios7d: 5, wau: 1, mau: 2, registeredUsers: 3 },
      metricSeries: new Map([['active_portfolios_7d', series(-5, 8)]]),
    } as unknown as StatementInputs);
    expect(down.deltaTone).toBe('bad');
    expect(sentence(down)).toBe(
      '5 active portfolios, trending down over the last 1 week.',
    );
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
    expect(sentence(fell)).toContain('fell from 90% to 50%');
    const rose = ruleR7({
      ...base,
      metricSeries: mk(5, 20),
    } as unknown as StatementInputs);
    expect(sentence(rose)).toContain('rose from 25% to 50%');
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

describe('narrative missing evidence and selection', () => {
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

describe('history and freshness boundaries', () => {
  it('R6 uses 1-week fallback when no history weeks', () => {
    const f = ruleR6({
      product: { activePortfolios7d: 5, wau: 1, mau: 2, registeredUsers: 3 },
      metricSeries: new Map([
        [
          'active_portfolios_7d',
          { series: [5], latest: 5, delta7d: 2, rowCount: 1 },
        ],
      ]),
    } as unknown as StatementInputs);
    const text = f.segments
      .map((s) => ('text' in s ? s.text : s.value))
      .join('');
    expect(text).toContain('1 week.');
    expect(text).not.toContain('1 weeks');
  });

  it('R7 null prior when observed is zero', () => {
    const f = ruleR7({
      product: { portfolioFresh24h: 10, portfolioUsers: 20 },
      metricSeries: new Map([
        [
          'fresh_24h',
          {
            series: [10, 10, 10, 10, 10, 10, 10, 10],
            latest: 10,
            delta7d: 0,
            rowCount: 8,
          },
        ],
        [
          'observed_portfolios',
          {
            series: [0, 20, 20, 20, 20, 20, 20, 20],
            latest: 20,
            delta7d: 0,
            rowCount: 8,
          },
        ],
      ]),
    } as unknown as StatementInputs);
    expect(f.delta).toBe('no prior reading');
  });

  it('R7 null prior on sparse hole', () => {
    const fresh = [10, 10, 10, 10, 10, 10, 10, 10];
    delete (fresh as unknown as Record<number, unknown>)[0];
    const f = ruleR7({
      product: { portfolioFresh24h: 10, portfolioUsers: 20 },
      metricSeries: new Map([
        [
          'fresh_24h',
          { series: fresh as number[], latest: 10, delta7d: 0, rowCount: 8 },
        ],
        [
          'observed_portfolios',
          {
            series: [20, 20, 20, 20, 20, 20, 20, 20],
            latest: 20,
            delta7d: 0,
            rowCount: 8,
          },
        ],
      ]),
    } as unknown as StatementInputs);
    expect(f.delta).toBe('no prior reading');
  });

  it('R7 null prior on observed hole', () => {
    const observed = [20, 20, 20, 20, 20, 20, 20, 20];
    delete (observed as unknown as Record<number, unknown>)[0];
    const f = ruleR7({
      product: { portfolioFresh24h: 10, portfolioUsers: 20 },
      metricSeries: new Map([
        [
          'fresh_24h',
          {
            series: [10, 10, 10, 10, 10, 10, 10, 10],
            latest: 10,
            delta7d: 0,
            rowCount: 8,
          },
        ],
        [
          'observed_portfolios',
          { series: observed as number[], latest: 20, delta7d: 0, rowCount: 8 },
        ],
      ]),
    } as unknown as StatementInputs);
    expect(f.delta).toBe('no prior reading');
  });

  it('R10 stage with no elapsed omits duration', () => {
    const f = ruleR10({
      now: NOW,
      podcastPipeline: {
        episodes: [
          {
            currentPhase: 'render',
            ingest: {
              status: 'failed',
              stage: 'download',
              updatedAt: 'not-a-date',
            },
            visual: null,
            renders: [],
          },
        ],
      },
      podcastCosts: {
        episodes: [{ totalCostUsd: 10, failedAttemptCostUsd: 1 }],
      },
      metricSeries: new Map(),
    } as unknown as StatementInputs);
    const text = f.segments
      .map((s) => ('text' in s ? s.text : s.value))
      .join('');
    expect(text).toContain('stuck at download');
    expect(text).not.toContain('for');
  });
});
