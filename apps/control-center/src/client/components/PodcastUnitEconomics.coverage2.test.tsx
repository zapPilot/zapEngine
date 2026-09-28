// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type {
  PodcastCostResponse,
  PodcastEpisodeCostSummary,
} from '../../shared/types.js';
import { podcastEpisodeCostFixture } from '../__fixtures__/dashboard.js';
import { PodcastUnitEconomics } from './PodcastUnitEconomics.js';

afterEach(cleanup);

function costs(episodes: PodcastEpisodeCostSummary[]): PodcastCostResponse {
  return {
    episodes,
    generatedAt: '2026-09-10T01:00:00Z',
    message: null,
    status: 'ok',
  };
}

describe('PodcastUnitEconomics plural', () => {
  it('pluralizes multiple priced lanes', () => {
    render(
      <PodcastUnitEconomics
        data={costs([
          podcastEpisodeCostFixture({
            breakdown: [
              { costUsd: 0.5, label: 'en transcription', operations: 1 },
            ],
            episodeId: 'ep-1',
            title: 'First',
          }),
          podcastEpisodeCostFixture({
            breakdown: [
              { costUsd: 0.6, label: 'en transcription', operations: 1 },
            ],
            episodeId: 'ep-2',
            title: 'Second',
          }),
        ])}
      />,
    );

    expect(screen.getByText('2 episodes')).toBeVisible();
  });
});
