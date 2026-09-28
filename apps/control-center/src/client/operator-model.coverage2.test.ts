import { describe, expect, it } from 'vitest';

import type { PodcastCostResponse } from '../shared/types.js';
import { podcastEpisodeCostFixture } from './__fixtures__/dashboard.js';
import { failedAttemptShareStat } from './operator-model.js';

function costs(episodes: PodcastCostResponse['episodes']): PodcastCostResponse {
  return {
    episodes,
    generatedAt: '2026-09-17T07:42:00.000Z',
    status: 'ok',
    message: null,
  };
}

describe('operator-model null-message coverage', () => {
  it('falls back when the ledger response is null', () => {
    expect(failedAttemptShareStat(null)).toMatchObject({
      caption: 'No priced attempts yet',
      tone: 'neutral',
      value: '—',
    });
  });

  it('falls back when an ok response carries a null message', () => {
    expect(failedAttemptShareStat(costs([]))).toMatchObject({
      caption: 'No priced attempts yet',
    });
  });

  it('falls back when an error response carries a null message', () => {
    expect(
      failedAttemptShareStat({
        ...costs([]),
        status: 'error',
        message: null,
      } as unknown as PodcastCostResponse),
    ).toMatchObject({
      caption: 'No priced attempts yet',
    });
  });

  it('prefers priced failure spend over any message', () => {
    const stat = failedAttemptShareStat(
      costs([
        podcastEpisodeCostFixture({
          totalCostUsd: 10,
          failedAttemptCostUsd: 1,
        }),
      ]),
    );
    expect(stat.caption).toContain('spent on attempts');
  });
});
