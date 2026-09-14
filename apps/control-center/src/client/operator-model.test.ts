import { describe, expect, it } from 'vitest';

import type { PodcastCostResponse } from '../shared/types.js';
import { podcastEpisodeCostFixture } from './__fixtures__/dashboard.js';
import {
  destinationFor,
  evidenceAmountText,
  failedAttemptCost,
  failedAttemptShareStat,
  sourceLabel,
  statusText,
} from './operator-model.js';

function costs(episodes: PodcastCostResponse['episodes']): PodcastCostResponse {
  return {
    episodes,
    generatedAt: '2026-09-17T07:42:00.000Z',
    status: 'ok',
    message: null,
  };
}

describe('failedAttemptCost', () => {
  it('returns nulls when the ledger is unavailable or empty', () => {
    expect(failedAttemptCost(null)).toEqual({ share: null, costUsd: null });
    expect(failedAttemptCost({ ...costs([]), status: 'error' })).toEqual({
      share: null,
      costUsd: null,
    });
    expect(failedAttemptCost(costs([]))).toEqual({
      share: null,
      costUsd: null,
    });
  });

  it('shares failed-attempt spend across all episode spend', () => {
    expect(
      failedAttemptCost(
        costs([
          podcastEpisodeCostFixture({
            totalCostUsd: 10,
            failedAttemptCostUsd: 2,
          }),
          podcastEpisodeCostFixture({
            totalCostUsd: 30,
            failedAttemptCostUsd: 3,
          }),
        ]),
      ),
    ).toEqual({ share: 0.125, costUsd: 5 });
  });

  it('refuses to call a share of zero spend 0%', () => {
    expect(
      failedAttemptCost(
        costs([
          podcastEpisodeCostFixture({
            totalCostUsd: 0,
            failedAttemptCostUsd: 0,
          }),
        ]),
      ),
    ).toEqual({ share: null, costUsd: 0 });
  });
});

describe('failedAttemptShareStat', () => {
  it('names the ledger failure instead of implying no failed attempts', () => {
    expect(
      failedAttemptShareStat({
        ...costs([]),
        message: 'relation does not exist',
        status: 'error',
      }),
    ).toEqual({
      caption: 'relation does not exist',
      tone: 'neutral',
      value: '—',
    });
  });

  it('flags a share above the danger threshold', () => {
    const stat = failedAttemptShareStat(
      costs([
        podcastEpisodeCostFixture({
          totalCostUsd: 10,
          failedAttemptCostUsd: 2,
        }),
      ]),
    );
    expect(stat.tone).toBe('danger');
    expect(stat.value).toBe('20.0%');
    expect(stat.caption).toBe('$2.00 spent on attempts whose run failed');
  });
});

describe('evidenceAmountText', () => {
  it('separates unknown evidence from a measured zero', () => {
    expect(evidenceAmountText({ usd: null, lowerBound: true })).toBe('Unknown');
    expect(evidenceAmountText({ usd: 0, lowerBound: true })).toBe('≥ $0.00');
    expect(evidenceAmountText({ usd: 0, lowerBound: false })).toBe('$0.00');
    expect(evidenceAmountText({ usd: 1.5, lowerBound: false })).toBe('$1.50');
  });
});

describe('statusText', () => {
  it('maps every operational status to reader words', () => {
    expect(statusText('critical')).toBe('Action required');
    expect(statusText('degraded')).toBe('Needs attention');
    expect(statusText('healthy')).toBe('Healthy');
    expect(statusText('unknown')).toBe('Unknown');
    expect(statusText(undefined)).toBe('Unknown');
  });
});

describe('sourceLabel', () => {
  it('labels known sources and passes the rest through', () => {
    expect(sourceLabel('fly')).toBe('Fly.io');
    expect(sourceLabel('github-actions')).toBe('GitHub Actions');
    expect(sourceLabel('telemetry' as never)).toBe('telemetry');
  });
});

describe('destinationFor', () => {
  it('sends social signals to pipeline and analytics to growth', () => {
    expect(destinationFor('social-queue', 'social')).toBe('pipeline');
    expect(destinationFor('social-daemon', 'social')).toBe('pipeline');
    expect(destinationFor('posthog', 'analytics')).toBe('growth');
  });

  it('defaults everything else to reliability', () => {
    expect(destinationFor('sentry', 'errors')).toBe('reliability');
    expect(destinationFor('fly', 'infra')).toBe('reliability');
  });
});
