import { describe, expect, it } from 'vitest';
import { ruleR10, ruleR6, ruleR7 } from './rules.js';
import type { StatementInputs } from './types.js';

const NOW = new Date('2026-09-17T07:42:00.000Z');

describe('rules coverage4', () => {
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
    expect(
      f.segments.map((s) => ('text' in s ? s.text : s.value)).join(''),
    ).toContain('1 weeks');
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
