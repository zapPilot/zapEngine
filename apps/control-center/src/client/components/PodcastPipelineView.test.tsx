// @vitest-environment jsdom
/* jscpd:ignore-start -- standard testing-library/vitest boilerplate */
import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  PodcastPipelineResponse,
  PodcastPipelineVisualDebug,
} from '../../shared/podcast-pipeline.js';
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

function visualDebug(
  overrides: Partial<PodcastPipelineVisualDebug>,
): PodcastPipelineVisualDebug {
  return {
    phase: 'planned',
    primarySubject: 'a16z',
    subjects: [{ id: 'subject-a16z', name: 'a16z' }],
    plannedQueries: [
      {
        sceneId: 'scene-01',
        subjectIds: ['subject-a16z'],
        selectionReason: 'direct',
        queries: ['a16z'],
      },
      {
        sceneId: 'scene-02',
        subjectIds: ['subject-a16z'],
        selectionReason: 'episode-context',
        queries: ['Andreessen Horowitz'],
      },
    ],
    actualSearches: [],
    ...overrides,
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

  it('labels keywords as planned and flags the missing trace before any provider call', () => {
    renderPipeline({
      data: pipelineResponse({ visualDebug: visualDebug({}) }),
    });

    expect(screen.getByText('Search keywords planned')).toBeInTheDocument();
    expect(screen.getByText('a16z · Andreessen Horowitz')).toBeInTheDocument();
    expect(
      screen.getByText('No provider search trace recorded yet'),
    ).toBeInTheDocument();
  });

  it('labels keywords as used and shows only what the provider was actually asked', () => {
    renderPipeline({
      data: pipelineResponse({
        visualDebug: visualDebug({
          phase: 'searched',
          actualSearches: [
            {
              sceneId: 'scene-01',
              provider: 'brave',
              query: 'a16z',
              returned: 20,
              accepted: 4,
              entityFiltered: 2,
              rejected: 1,
            },
          ],
        }),
      }),
    });

    const keywords = screen.getByText('Search keywords used').parentElement;
    expect(keywords).toHaveTextContent('a16z');
    expect(keywords).not.toHaveTextContent('Andreessen Horowitz');
    expect(
      screen.queryByText('Search keywords planned'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('No provider search trace recorded yet'),
    ).not.toBeInTheDocument();
  });
});
