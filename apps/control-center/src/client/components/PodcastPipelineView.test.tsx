// @vitest-environment jsdom
/* jscpd:ignore-start -- standard testing-library/vitest boilerplate */
import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PodcastPipelineResponse } from '../../shared/podcast-pipeline.js';
import { PodcastPipelineView } from './PodcastPipelineView.js';
/* jscpd:ignore-end */

const episodeId = '826f4b87-6278-4275-bff5-535ba5ef438d';

function pipelineResponse(
  overrides: Partial<PodcastPipelineResponse['episodes'][number]> = {},
): PodcastPipelineResponse {
  return {
    generatedAt: '2026-09-01T00:00:00.000Z',
    status: 'ok',
    message: null,
    episodes: [
      {
        episodeId,
        title: 'Pipeline recovery test',
        sourceUrl: 'https://example.com/article',
        createdAt: '2026-08-31T15:54:10.000Z',
        currentPhase: 'video',
        translationStatus: 'completed',
        ttsStatus: 'completed',
        videoStatus: 'failed',
        ingest: null,
        localizations: [
          {
            languageCode: 'zh-Hant',
            status: 'completed',
            hasScript: true,
            hasAudio: true,
            updatedAt: '2026-09-01T00:00:00.000Z',
          },
          {
            languageCode: 'ja',
            status: 'completed',
            hasScript: true,
            hasAudio: true,
            updatedAt: '2026-09-01T00:00:00.000Z',
          },
          {
            languageCode: 'en',
            status: 'completed',
            hasScript: true,
            hasAudio: true,
            updatedAt: '2026-09-01T00:00:00.000Z',
          },
        ],
        visual: {
          status: 'failed',
          progressPercent: 5,
          stage: 'subject-catalog',
          attempts: 3,
          lastError: 'subject catalog exhausted retries',
          leaseExpiresAt: null,
          updatedAt: '2026-09-01T00:00:00.000Z',
        },
        renders: [],
        canRestartVideo: true,
        ...overrides,
      },
    ],
  };
}

afterEach(cleanup);

function renderPipeline(input: {
  data?: PodcastPipelineResponse;
  restartingEpisodeId?: string | null;
}) {
  const onRestartVideo = vi.fn();
  render(
    <PodcastPipelineView
      data={input.data ?? pipelineResponse()}
      onRestartVideo={onRestartVideo}
      restartingEpisodeId={input.restartingEpisodeId ?? null}
    />,
  );
  return { onRestartVideo };
}

describe('PodcastPipelineView', () => {
  it('surfaces the blocking visual failure and invokes the narrow video retry action', () => {
    const { onRestartVideo } = renderPipeline({});

    expect(screen.getByText('Visual failure')).toBeVisible();
    expect(screen.getByText('subject catalog exhausted retries')).toBeVisible();
    const button = screen.getByRole('button', { name: 'Restart video' });
    expect(button).toBeEnabled();

    fireEvent.click(button);
    expect(onRestartVideo).toHaveBeenCalledWith(episodeId);
  });

  it('disables retry while the server read model says video cannot be restarted', () => {
    const { onRestartVideo } = renderPipeline({
      data: pipelineResponse({
        videoStatus: 'processing',
        canRestartVideo: false,
      }),
    });

    const button = screen.getByRole('button', { name: 'Restart video' });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onRestartVideo).not.toHaveBeenCalled();
  });

  it('shows a restarting state and prevents duplicate operator clicks', () => {
    renderPipeline({ restartingEpisodeId: episodeId });

    const button = screen.getByRole('button', { name: 'Restarting…' });
    expect(button).toBeDisabled();
  });
});
