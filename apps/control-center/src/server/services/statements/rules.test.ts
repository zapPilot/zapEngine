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
  ruleR5,
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

describe('ruleR5', () => {
  it('names a topic that clears the lift bar', () => {
    const finding = ruleR5({
      socialPerformance: {
        decisions: [
          {
            platform: 'x',
            bestTopic: 'regime shifts',
            bestTopicLiftVsPlatformMedian: 2,
            confidence: 'medium',
            publishSlotsJst: 'Thursday 20:00 JST',
            bestTopicSamples: 6,
          },
        ],
      },
    } as unknown as StatementInputs);

    expect(sentence(finding)).toBe(
      'Posts on regime shifts do 2.0× the x median — publish the next one at Thursday 20:00 JST.',
    );
    expect(finding.fact?.value).toBe('regime shifts: 2.0× x median');
  });

  it('asks for a comparable mix below the bar', () => {
    const finding = ruleR5({
      socialPerformance: {
        decisions: [
          {
            platform: 'threads',
            bestTopic: 'a topic',
            bestTopicLiftVsPlatformMedian: 1.2,
            confidence: 'medium',
          },
        ],
      },
    } as unknown as StatementInputs);

    expect(sentence(finding)).toContain('Not enough separation yet on threads');
  });

  it('stays silent with no topics at all', () => {
    const finding = ruleR5({
      socialPerformance: { decisions: [] },
    } as unknown as StatementInputs);

    expect(finding.segments).toEqual([]);
    expect(finding.fact).toBeNull();
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

  it('reports average cost and retry share once episodes are priced', () => {
    const finding = ruleR10({
      now: NOW,
      podcastPipeline: { episodes: [] },
      podcastCosts: {
        episodes: [{ totalCostUsd: 10, runCount: 2, retryWasteUsd: 1 }],
      },
      metricSeries: new Map(),
    } as unknown as StatementInputs);

    expect(finding.value).toBe('$10.00');
    expect(sentence(finding)).toContain('Average episode $10.00');
    expect(sentence(finding)).toContain('retries are 10% of that.');
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
