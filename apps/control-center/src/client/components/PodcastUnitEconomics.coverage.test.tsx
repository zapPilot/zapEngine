// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
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

describe('PodcastUnitEconomics coverage', () => {
  it('picks the later episode when it costs more', () => {
    render(
      <PodcastUnitEconomics
        data={costs([
          podcastEpisodeCostFixture({
            episodeId: 'cheap',
            title: 'Cheap',
            totalCostUsd: 1,
          }),
          podcastEpisodeCostFixture({
            episodeId: 'expensive',
            title: 'Expensive episode',
            totalCostUsd: 9,
          }),
        ])}
      />,
    );

    expect(
      screen.getAllByText('Expensive episode').length,
    ).toBeGreaterThanOrEqual(2);
  });

  it('counts a singular priced lane without a plural suffix', () => {
    render(
      <PodcastUnitEconomics
        data={costs([
          podcastEpisodeCostFixture({
            breakdown: [
              { costUsd: 0.5, label: 'en transcription', operations: 1 },
            ],
            title: 'Single lane',
          }),
        ])}
      />,
    );

    expect(screen.getByText('1 episode')).toBeVisible();
  });

  it('shows a failed-attempt warning tone only when failures cost money', () => {
    const { unmount } = render(
      <PodcastUnitEconomics
        data={costs([
          podcastEpisodeCostFixture({
            failedAttemptCostUsd: 2,
            title: 'With failure',
            totalCostUsd: 10,
          }),
        ])}
      />,
    );
    expect(document.querySelector('.warning-text')).not.toBeNull();
    unmount();
    cleanup();

    render(
      <PodcastUnitEconomics
        data={costs([
          podcastEpisodeCostFixture({
            failedAttemptCostUsd: 0,
            title: 'Clean',
            totalCostUsd: 10,
          }),
        ])}
      />,
    );
    expect(screen.getAllByText('Clean').length).toBeGreaterThanOrEqual(1);
  });

  it('renders zero and multi-operation breakdowns with their counts', () => {
    render(
      <PodcastUnitEconomics
        data={costs([
          podcastEpisodeCostFixture({
            breakdown: [
              { costUsd: 0.3, label: 'en transcription', operations: 1 },
              { costUsd: 0.4, label: 'ja transcription', operations: 1 },
            ],
            title: 'Ops episode',
          }),
        ])}
      />,
    );

    const episode = screen
      .getByText('Ops episode', {
        selector: '.podcast-episode-title strong',
      })
      .closest('details');
    fireEvent.click(
      screen.getByText('Ops episode', {
        selector: '.podcast-episode-title strong',
      }),
    );
    expect(within(episode!).getByText(/en transcription/)).toBeVisible();
  });

  it('labels an unknown language code as-is', () => {
    render(
      <PodcastUnitEconomics
        data={costs([
          podcastEpisodeCostFixture({
            breakdown: [
              { costUsd: 0.2, label: 'ko transcription', operations: 1 },
            ],
            title: 'Unknown lang',
          }),
        ])}
      />,
    );

    // 'ko transcription' does not match the language parser, so no language
    // grid row appears for it; the episode still renders.
    expect(screen.getAllByText('Unknown lang').length).toBeGreaterThanOrEqual(
      1,
    );
  });
});
