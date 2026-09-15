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
  it('reports that costs are still loading', () => {
    render(<PodcastUnitEconomics data={null} />);

    expect(screen.getByText('Loading production costs…')).toBeVisible();
  });

  it('names a ledger failure', () => {
    render(
      <PodcastUnitEconomics
        data={{
          episodes: [],
          generatedAt: '2026-09-10T01:00:00Z',
          message: 'boom',
          status: 'error',
        }}
      />,
    );

    expect(screen.getByText('boom')).toBeVisible();
  });

  it('falls back to a generic message when the failure names nothing', () => {
    render(
      <PodcastUnitEconomics
        data={{
          episodes: [],
          generatedAt: '2026-09-10T01:00:00Z',
          message: null,
          status: 'error',
        }}
      />,
    );

    expect(screen.getByText('Production cost data unavailable.')).toBeVisible();
  });

  it('says no runs have been recorded yet', () => {
    render(<PodcastUnitEconomics data={costs([])} />);

    expect(
      screen.getByText('No production cost runs recorded yet.'),
    ).toBeVisible();
  });

  it('shows a dash, not 0%, when nothing was spent', () => {
    render(
      <PodcastUnitEconomics
        data={costs([
          podcastEpisodeCostFixture({
            failedAttemptCostUsd: 0,
            podcastCostUsd: 0,
            totalCostUsd: 0,
            videoCostUsd: 0,
          }),
        ])}
      />,
    );

    expect(screen.getByText('Average / episode')).toBeVisible();
    expect(screen.getByText(/— of episode cost/)).toBeVisible();
  });

  it('audits the costliest episode even when it has no title', () => {
    render(
      <PodcastUnitEconomics
        data={costs([
          podcastEpisodeCostFixture({
            breakdown: [],
            episodeId: 'abcdef1234567890',
            failedAttemptCostUsd: 0,
            failedRuns: 0,
            runCount: 1,
            title: null,
            unpricedStages: 1,
          }),
        ])}
      />,
    );

    expect(screen.getAllByText('Episode abcdef12')).toHaveLength(2);
    const untitled = screen
      .getAllByText('Episode abcdef12')[1]!
      .closest('details');
    fireEvent.click(screen.getAllByText('Episode abcdef12')[1]!);
    expect(within(untitled!).getByText('No priced stages')).toBeVisible();
    expect(within(untitled!).getByText('1 unpriced stage')).toBeVisible();
    // One run with no failure: no "· N failed" suffix on the run count.
    expect(
      within(untitled!).getByText('1', { selector: '.podcast-runs' }),
    ).toBeVisible();
    expect(within(untitled!).queryByText(/· 1 failed/)).toBeNull();
  });

  it('averages audio and video per language and marks unpriced lanes', () => {
    render(
      <PodcastUnitEconomics
        data={costs([
          podcastEpisodeCostFixture({
            breakdown: [
              { costUsd: 0.3, label: 'en transcription', operations: 1 },
              { costUsd: 0.8, label: 'en render', operations: 1 },
              { costUsd: 0.5, label: 'ja render', operations: 2 },
              { costUsd: 0.1, label: 'Fish TTS', operations: 1 },
            ],
            failedAttemptCostUsd: 0,
            podcastCostUsd: 0.3,
            totalCostUsd: 1.7,
            videoCostUsd: 1.3,
          }),
          podcastEpisodeCostFixture({
            breakdown: [
              { costUsd: 0.4, label: 'zh-Hans render', operations: 1 },
            ],
            episodeId: 'episode-2',
            failedAttemptCostUsd: 0,
            podcastCostUsd: 0,
            title: 'Second',
            totalCostUsd: 0.4,
            videoCostUsd: 0.4,
          }),
        ])}
      />,
    );

    expect(screen.getByText('English')).toBeVisible();
    expect(screen.getByText('Japanese')).toBeVisible();
    expect(screen.getByText('Simplified Chinese')).toBeVisible();
    expect(screen.getAllByText('no priced runs')).toHaveLength(2);
  });

  it('counts the episode note in singular and plural', () => {
    const { rerender } = render(
      <PodcastUnitEconomics
        data={costs([podcastEpisodeCostFixture({ title: 'One' })])}
      />,
    );
    expect(screen.getByText(/Based on 1 recent episode\./)).toBeVisible();

    rerender(
      <PodcastUnitEconomics
        data={costs([
          podcastEpisodeCostFixture({ title: 'One' }),
          podcastEpisodeCostFixture({ episodeId: 'episode-2', title: 'Two' }),
        ])}
      />,
    );
    expect(screen.getByText(/Based on 2 recent episodes\./)).toBeVisible();
  });

  it('spells out the outlier stage breakdown with its operation counts', () => {
    render(
      <PodcastUnitEconomics
        data={costs([
          podcastEpisodeCostFixture({
            breakdown: [{ costUsd: 0.3, label: 'Fish TTS', operations: 2 }],
            title: 'Expensive episode',
            unpricedStages: 2,
          }),
        ])}
      />,
    );

    const episode = screen
      .getByText('Expensive episode', {
        selector: '.podcast-episode-title strong',
      })
      .closest('details');
    expect(episode).not.toBeNull();
    fireEvent.click(
      screen.getByText('Expensive episode', {
        selector: '.podcast-episode-title strong',
      }),
    );
    expect(within(episode!).getByText(/Fish TTS/)).toBeVisible();
    expect(within(episode!).getByText(/×2/)).toBeVisible();
    expect(within(episode!).getByText('2 unpriced stages')).toBeVisible();
  });
});
