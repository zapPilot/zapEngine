import { describe, expect, it } from 'vitest';

import type { PodcastCostResponse } from '../shared/types.js';
import {
  destinationFor,
  retryWaste,
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

describe('retryWaste', () => {
  it('returns nulls when the ledger is unavailable or empty', () => {
    expect(retryWaste(null)).toEqual({ rate: null, wasteUsd: null });
    expect(retryWaste({ ...costs([]), status: 'error' })).toEqual({
      rate: null,
      wasteUsd: null,
    });
    expect(retryWaste(costs([]))).toEqual({ rate: null, wasteUsd: null });
  });

  it('shares waste across all spend, never zero by default', () => {
    expect(
      retryWaste(
        costs([
          { totalCostUsd: 10, retryWasteUsd: 2 },
          { totalCostUsd: 30, retryWasteUsd: 3 },
        ] as never),
      ),
    ).toEqual({ rate: 0.125, wasteUsd: 5 });
  });

  it('reports an honest zero only when spend exists without waste', () => {
    expect(
      retryWaste(costs([{ totalCostUsd: 0, retryWasteUsd: 0 }] as never)),
    ).toEqual({ rate: 0, wasteUsd: 0 });
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
