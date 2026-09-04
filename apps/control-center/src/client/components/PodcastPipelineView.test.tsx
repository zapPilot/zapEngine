// @vitest-environment jsdom
/* jscpd:ignore-start -- standard testing-library/vitest boilerplate */
import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  PodcastPipelineResponse,
  PodcastPipelineVisualDebug,
  PodcastPipelineVisualSearchAttempt,
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
        canForceReplanVisual: false,
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
    subjectCatalogFailure: null,
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
    budget: null,
    primarySubjects: [],
    plannedSubjectSearches: [],
    actualSearches: [],
    sceneSelections: [],
    reuse: [],
    ...overrides,
  };
}

function braveRequest(
  overrides: Partial<PodcastPipelineVisualSearchAttempt>,
): PodcastPipelineVisualSearchAttempt {
  return {
    sceneId: null,
    provider: 'brave',
    kind: 'primary',
    subjectLabel: 'a16z',
    query: 'a16z venture capital firm',
    returned: 100,
    viable: 41,
    drops: [],
    error: null,
    ...overrides,
  };
}

afterEach(cleanup);

function renderPipeline(input: {
  data?: PodcastPipelineResponse;
  restartingEpisodeId?: string | null;
}) {
  const onRestartStep = vi.fn();
  render(
    <PodcastPipelineView
      data={input.data ?? pipelineResponse()}
      onLoadVisualDebug={vi.fn()}
      onResolveReview={vi.fn()}
      onRestartStep={onRestartStep}
      onSubmitReview={vi.fn()}
      restartingEpisodeId={input.restartingEpisodeId ?? null}
      visualDebugByEpisode={{}}
    />,
  );
  return { onRestartStep };
}

describe('PodcastPipelineView', () => {
  it('surfaces the blocking visual failure and resumes video from durable checkpoints', () => {
    const { onRestartStep } = renderPipeline({});

    expect(screen.getByText('Visual failure')).toBeVisible();
    expect(screen.getByText('subject catalog exhausted retries')).toBeVisible();
    const button = screen.getByRole('button', { name: 'Resume video' });
    expect(button).toBeEnabled();

    fireEvent.click(button);
    expect(onRestartStep).toHaveBeenCalledWith(episodeId, {
      step: 'video',
      forceReplan: false,
    });
  });

  it('invokes ingest recovery for a failed translation phase', () => {
    const { onRestartStep } = renderPipeline({
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
          failureHistory: [],
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
    expect(onRestartStep).toHaveBeenCalledTimes(1);
    expect(onRestartStep).toHaveBeenCalledWith(episodeId, { step: 'ingest' });
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

  it('disables resume while the server read model says video cannot be restarted', () => {
    const { onRestartStep } = renderPipeline({
      data: pipelineResponse({
        videoStatus: 'processing',
        canRestartVideo: false,
      }),
    });

    const button = screen.getByRole('button', { name: 'Resume video' });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onRestartStep).not.toHaveBeenCalled();
  });

  it('shows a resuming state and prevents duplicate operator clicks', () => {
    renderPipeline({ restartingEpisodeId: episodeId });

    const button = screen.getByRole('button', { name: 'Resuming…' });
    expect(button).toBeDisabled();
  });

  it('keeps destructive visual re-planning behind advanced recovery and requires confirmation', () => {
    const { onRestartStep } = renderPipeline({
      data: pipelineResponse({ canForceReplanVisual: true }),
    });

    const advanced = screen.getByText('Advanced recovery').closest('details');
    expect(advanced).not.toHaveAttribute('open');
    expect(screen.getByRole('button', { name: 'Resume video' })).toBeEnabled();

    fireEvent.click(screen.getByText('Advanced recovery'));
    fireEvent.click(screen.getByRole('button', { name: 'Re-plan visuals' }));
    expect(onRestartStep).not.toHaveBeenCalled();

    const confirm = screen.getByRole('button', {
      name: 'Confirm re-plan (re-renders 3 videos)',
    });
    fireEvent.click(confirm);
    expect(onRestartStep).toHaveBeenCalledWith(episodeId, {
      step: 'video',
      forceReplan: true,
    });
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
              kind: null,
              subjectLabel: null,
              query: 'a16z',
              returned: 20,
              viable: 4,
              drops: [
                { reason: 'entity-filtered', count: 2 },
                { reason: 'rejected', count: 1 },
              ],
              error: null,
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
  it('reports the episode request budget against its per-episode ceiling', () => {
    renderPipeline({
      data: pipelineResponse({
        visualDebug: visualDebug({
          phase: 'searched',
          budget: {
            requestCount: 6,
            max: 8,
            primary: 5,
            targeted: 3,
            exhausted: true,
          },
          actualSearches: [
            ...Array.from({ length: 5 }, (_unused, index) =>
              braveRequest({
                kind: 'primary',
                subjectLabel: `subject-${index}`,
                query: `subject ${index}`,
              }),
            ),
            braveRequest({
              kind: 'targeted',
              sceneId: 'scene-04',
              subjectLabel: 'a16z',
              query: 'a16z office',
            }),
          ],
        }),
      }),
    });

    expect(
      screen.getByText('requests 6/8 · primary 5/5 · targeted 1/3 · exhausted'),
    ).toBeInTheDocument();
  });

  it('lists a primary request by subject and shows its drops and provider error', () => {
    renderPipeline({
      data: pipelineResponse({
        visualDebug: visualDebug({
          phase: 'searched',
          primarySubjects: [{ label: 'Justin Sun', query: 'Justin Sun' }],
          actualSearches: [
            braveRequest({
              kind: 'primary',
              subjectLabel: 'Justin Sun',
              query: 'Justin Sun',
              returned: 100,
              viable: 41,
              drops: [{ reason: 'decorative-asset', count: 38 }],
              error: 'brave images request failed with 429',
            }),
          ],
        }),
      }),
    });

    expect(screen.getByText('Justin Sun · primary')).toBeInTheDocument();
    expect(
      screen.getByText('returned 100 · viable 41 · drops decorative-asset 38'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('brave images request failed with 429'),
    ).toBeInTheDocument();
    expect(screen.getByText('Justin Sun · “Justin Sun”')).toBeInTheDocument();
  });

  it('names the image a scene actually got and the rung it fell back to', () => {
    renderPipeline({
      data: pipelineResponse({
        visualDebug: visualDebug({
          phase: 'searched',
          sceneSelections: [
            {
              sceneId: 'scene-02',
              selection: 'pool-fallback',
              fallbackReason: 'subject-not-searched',
              matchedSubjectKey: 'a16z',
              sourceQuery: 'a16z venture capital firm',
              providerRank: 4,
            },
          ],
          reuse: [{ assetId: 'image-01', useCount: 3 }],
        }),
      }),
    });

    expect(screen.getByText('scene-02 · pool-fallback')).toBeInTheDocument();
    expect(
      screen.getByText('a16z · from “a16z venture capital firm” (#4)'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('fallback: subject-not-searched'),
    ).toBeInTheDocument();
    expect(screen.getByText('image-01 · 3 scenes')).toBeInTheDocument();
  });

  it('names the reason a degraded subject catalog is missing', () => {
    renderPipeline({
      data: pipelineResponse({
        visualDebug: visualDebug({
          primarySubject: null,
          subjects: [],
          subjectCatalogFailure:
            'subject catalog answer named no known subject',
        }),
      }),
    });

    expect(screen.getByText('No subject catalog recorded')).toBeInTheDocument();
    expect(
      screen.getByText(
        'catalog degraded: subject catalog answer named no known subject',
      ),
    ).toBeInTheDocument();
  });

  it('says nothing extra when no catalog failure was recorded', () => {
    renderPipeline({
      data: pipelineResponse({
        visualDebug: visualDebug({ primarySubject: null, subjects: [] }),
      }),
    });

    expect(screen.getByText('No subject catalog recorded')).toBeInTheDocument();
    expect(screen.queryByText(/catalog degraded/u)).not.toBeInTheDocument();
  });

  it('shows the subject queries a planned checkpoint intended to spend', () => {
    renderPipeline({
      data: pipelineResponse({
        visualDebug: visualDebug({
          plannedSubjectSearches: [
            { label: 'a16z', query: 'a16z venture capital firm' },
          ],
        }),
      }),
    });

    expect(screen.getByText('Search keywords planned')).toBeInTheDocument();
    expect(
      screen.getByText('a16z · “a16z venture capital firm”'),
    ).toBeInTheDocument();
  });
});
