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
        canRestartIngest: false,
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
  const onRestartIngest = vi.fn();
  const onRestartVideo = vi.fn();
  render(
    <PodcastPipelineView
      data={input.data ?? pipelineResponse()}
      onRestartIngest={onRestartIngest}
      onRestartVideo={onRestartVideo}
      restartingEpisodeId={input.restartingEpisodeId ?? null}
    />,
  );
  return { onRestartIngest, onRestartVideo };
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

  it('invokes ingest recovery for a failed translation phase', () => {
    const { onRestartIngest, onRestartVideo } = renderPipeline({
      data: pipelineResponse({
        currentPhase: 'translation',
        translationStatus: 'failed',
        ttsStatus: 'pending',
        videoStatus: 'pending',
        ingest: {
          status: 'failed',
          progressPercent: null,
          stage: null,
          attempts: 0,
          lastError: null,
          leaseExpiresAt: null,
          updatedAt: '2026-08-28T10:02:15.000Z',
        },
        visual: null,
        renders: [],
        canRestartIngest: true,
        canRestartVideo: false,
      }),
    });

    const button = screen.getByRole('button', { name: 'Restart ingest' });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(onRestartIngest).toHaveBeenCalledWith(episodeId);
    expect(onRestartVideo).not.toHaveBeenCalled();
  });

  it('does not surface a stale visual error while a retry is processing', () => {
    renderPipeline({
      data: pipelineResponse({
        videoStatus: 'processing',
        canRestartVideo: false,
        visual: {
          status: 'processing',
          progressPercent: 15,
          stage: 'subject-catalog',
          attempts: 2,
          lastError: 'previous attempt failed',
          leaseExpiresAt: '2026-09-01T00:05:00.000Z',
          updatedAt: '2026-09-01T00:01:00.000Z',
        },
      }),
    });

    expect(screen.queryByText('Visual failure')).not.toBeInTheDocument();
    expect(
      screen.queryByText('previous attempt failed'),
    ).not.toBeInTheDocument();
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
