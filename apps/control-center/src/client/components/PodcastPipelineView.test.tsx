// @vitest-environment jsdom
/* jscpd:ignore-start -- standard testing-library/vitest boilerplate */
import '@testing-library/jest-dom/vitest';

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  PodcastPipelineRenderState,
  PodcastPipelineResponse,
  PodcastPipelineVisualDebug,
  PodcastPipelineVisualSearchAttempt,
} from '../../shared/podcast-pipeline.js';
import type { PodcastVisualDebugResponse } from '../../shared/podcast-visual.js';
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
            hasAudio: false,
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

function renderState(
  overrides: Partial<PodcastPipelineRenderState> & {
    languageCode: PodcastPipelineRenderState['languageCode'];
  },
): PodcastPipelineRenderState {
  return {
    status: 'processing',
    progressPercent: 62,
    stage: 'encoding',
    attempts: 1,
    lastError: null,
    leaseExpiresAt: null,
    updatedAt: '2026-09-01T00:00:00.000Z',
    localizationId: `loc-${overrides.languageCode}`,
    canRestart: false,
    ...overrides,
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
    candidates: [],
    error: null,
    ...overrides,
  };
}

function lazyVisualDebug(
  overrides: Partial<PodcastVisualDebugResponse> = {},
): PodcastVisualDebugResponse {
  return {
    status: 'ok',
    message: null,
    episode: {
      id: episodeId,
      title: 'Pipeline recovery test',
      sourceUrl: 'https://example.com/article',
    },
    visual: {
      status: 'completed',
      visualVersion: 'visual-v10',
      visualHash: 'f'.repeat(64),
      attempts: 1,
      lastError: null,
    },
    scenes: [],
    failure: null,
    reviews: [],
    rawPlan: null,
    ...overrides,
  };
}

afterEach(cleanup);

function renderPipeline(input: {
  data?: PodcastPipelineResponse;
  restartingEpisodeId?: string | null;
  visualDebugByEpisode?: Record<string, PodcastVisualDebugResponse>;
}) {
  const onRestartStep = vi.fn();
  const view = (data: PodcastPipelineResponse) => (
    <PodcastPipelineView
      data={data}
      onLoadVisualDebug={vi.fn()}
      onResolveReview={vi.fn()}
      onRestartStep={onRestartStep}
      onSubmitReview={vi.fn()}
      restartingEpisodeId={input.restartingEpisodeId ?? null}
      visualDebugByEpisode={input.visualDebugByEpisode ?? {}}
    />
  );
  const { rerender } = render(view(input.data ?? pipelineResponse()));
  return {
    onRestartStep,
    rerender: (data: PodcastPipelineResponse) => rerender(view(data)),
  };
}

// jsdom ships neither <summary> activation behaviour nor the closed-<details>
// display rule, so the disclosure has to be driven through `open` directly and
// its toggle event, queued as a macrotask, has to be flushed.
async function setAdvancedRecoveryOpen(open: boolean) {
  const details = screen.getByText('Advanced recovery').closest('details');
  if (!(details instanceof HTMLDetailsElement)) {
    throw new Error('Advanced recovery disclosure is not rendered');
  }
  await act(async () => {
    details.open = open;
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function renderReplanCapablePipeline() {
  return renderPipeline({
    data: pipelineResponse({ canForceReplanVisual: true }),
  });
}

async function armReplanConfirmation() {
  await setAdvancedRecoveryOpen(true);
  fireEvent.click(screen.getByRole('button', { name: 'Re-plan visuals' }));
}

function expectReplanDisarmed() {
  expect(
    screen.getByRole('button', { name: 'Re-plan visuals' }),
  ).toBeInTheDocument();
}

function phaseCell(label: string): HTMLElement {
  // The current phase chip carries the same word as the grid cell, so the cell
  // has to be picked by where the label sits rather than by the label alone.
  const cell = screen
    .getAllByText(label)
    .map((node) => node.parentElement)
    .find((parent) => parent?.classList.contains('pipeline-phase-cell'));
  if (!cell) {
    throw new Error(`No phase cell for ${label}`);
  }
  return cell;
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

  it('keeps destructive visual re-planning behind advanced recovery and requires confirmation', async () => {
    const { onRestartStep } = renderReplanCapablePipeline();

    const advanced = screen.getByText('Advanced recovery').closest('details');
    expect(advanced).not.toHaveAttribute('open');
    expect(screen.getByRole('button', { name: 'Resume video' })).toBeEnabled();

    await armReplanConfirmation();
    expect(onRestartStep).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Confirm re-plan (re-renders 3 videos)',
      }),
    );
    expect(onRestartStep).toHaveBeenCalledWith(episodeId, {
      step: 'video',
      forceReplan: true,
    });
  });

  it('disarms the re-plan confirmation when advanced recovery is collapsed', async () => {
    const { onRestartStep } = renderReplanCapablePipeline();

    await armReplanConfirmation();
    await setAdvancedRecoveryOpen(false);
    await setAdvancedRecoveryOpen(true);

    expectReplanDisarmed();
    expect(onRestartStep).not.toHaveBeenCalled();
  });

  it('drops the armed re-plan when the read model stops allowing it', async () => {
    const { onRestartStep, rerender } = renderReplanCapablePipeline();

    await armReplanConfirmation();
    rerender(pipelineResponse({ canForceReplanVisual: false }));
    expect(screen.queryByText('Advanced recovery')).not.toBeInTheDocument();

    rerender(pipelineResponse({ canForceReplanVisual: true }));
    expectReplanDisarmed();
    expect(onRestartStep).not.toHaveBeenCalled();
  });

  it('shows the whole episode id and copies it on click', () => {
    renderPipeline({});

    const id = screen.getByRole('button', { name: 'Copy episode id' });
    // Eight characters was enough to recognize the card and useless for every
    // retry command, log filter and SQL query written next to it.
    expect(id).toHaveTextContent(episodeId);

    fireEvent.click(id);
    expect(id).toHaveTextContent('Copied');
  });

  it('puts each language inside the phase it belongs to instead of a separate section', () => {
    const { onRestartStep } = renderPipeline({
      data: pipelineResponse({
        renders: [
          renderState({ languageCode: 'zh-Hant' }),
          renderState({
            languageCode: 'ja',
            status: 'failed',
            lastError: 'ffmpeg exited 1',
            canRestart: true,
          }),
          renderState({ languageCode: 'en', status: 'queued' }),
        ],
      }),
    });

    expect(
      screen.queryByText('Language and render details'),
    ).not.toBeInTheDocument();

    const video = phaseCell('Video');
    expect(within(video).getByText('🇹🇼 zh-Hant')).toBeInTheDocument();
    expect(within(video).getByText('🇯🇵 ja')).toBeInTheDocument();
    expect(within(video).getByText('🇺🇸 en')).toBeInTheDocument();
    expect(within(video).getByText('ffmpeg exited 1')).toBeInTheDocument();

    // Only the failed language offers a retry, and it retries just that render.
    const retries = within(video).getAllByRole('button', {
      name: 'Retry render',
    });
    expect(retries).toHaveLength(1);
    fireEvent.click(retries[0] as HTMLElement);
    expect(onRestartStep).toHaveBeenCalledWith(episodeId, {
      step: 'render',
      localizationId: 'loc-ja',
    });
  });

  it('reads script and audio readiness per language from their own phases', () => {
    renderPipeline({});

    const tts = phaseCell('TTS');
    expect(within(tts).getAllByText('Done')).toHaveLength(3);
    expect(within(tts).getAllByText('Pending')).toHaveLength(1);
  });

  it('collapses the visual evidence into a single debug section', () => {
    renderPipeline({
      data: pipelineResponse({ visualDebug: visualDebug({}) }),
    });

    expect(screen.queryByText('Visual search debug')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Visual plan, search trace and review'),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/^Visual debug/u)).toBeInTheDocument();
  });

  it('flags the missing trace and lists what the attempt intended to search', () => {
    renderPipeline({
      data: pipelineResponse({ visualDebug: visualDebug({}) }),
    });

    const planned = screen
      .getByText('Planned searches')
      .closest('.podcast-visual-searches') as HTMLElement;
    expect(
      within(planned).getByText('No provider search trace recorded yet'),
    ).toBeInTheDocument();
    expect(within(planned).getByText('a16z')).toBeInTheDocument();
    expect(
      within(planned).getByText('Andreessen Horowitz'),
    ).toBeInTheDocument();
  });

  it('drops the planned list once real requests exist', () => {
    renderPipeline({
      data: pipelineResponse({
        visualDebug: visualDebug({
          phase: 'searched',
          actualSearches: [braveRequest({ query: 'a16z' })],
        }),
      }),
    });

    expect(screen.getByText('Searches')).toBeInTheDocument();
    expect(screen.queryByText('Planned searches')).not.toBeInTheDocument();
    expect(
      screen.queryByText('No provider search trace recorded yet'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Andreessen Horowitz')).not.toBeInTheDocument();
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
    expect(screen.getByText(/^Visual debug/u)).toHaveTextContent(
      'requests 6/8',
    );
  });

  it('lists a primary request by subject and shows its drops and provider error', () => {
    renderPipeline({
      data: pipelineResponse({
        visualDebug: visualDebug({
          phase: 'searched',
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
  });

  it('shows what came back, which result was dropped, and which scene took one', () => {
    renderPipeline({
      data: pipelineResponse({
        visualDebug: visualDebug({
          phase: 'searched',
          actualSearches: [
            braveRequest({
              query: 'Tether',
              candidates: [
                {
                  imageUrl: 'https://images.example.com/tether-logo.png',
                  sourceUrl: 'https://tether.to/brand',
                  altText: 'Tether logo',
                  providerRank: 0,
                  dropReason: 'decorative-asset',
                  selectedBySceneId: null,
                },
                {
                  imageUrl: 'https://images.example.com/tethering.jpg',
                  sourceUrl: 'https://www.howto.example/tethering',
                  altText: 'Tethering your phone',
                  providerRank: 28,
                  dropReason: null,
                  selectedBySceneId: 'scene-01',
                },
              ],
            }),
          ],
        }),
      }),
    });

    const dropped = screen
      .getByAltText('Tether logo')
      .closest('.podcast-visual-candidate');
    expect(dropped).toHaveClass('dropped');
    expect(
      within(dropped as HTMLElement).getByText('decorative-asset'),
    ).toBeInTheDocument();

    const selected = screen
      .getByAltText('Tethering your phone')
      .closest('.podcast-visual-candidate');
    expect(selected).toHaveClass('selected');
    expect(
      within(selected as HTMLElement).getByText('scene-01'),
    ).toBeInTheDocument();
    expect(
      within(selected as HTMLElement).getByText('#28 · www.howto.example'),
    ).toBeInTheDocument();
  });

  it('says candidates were never recorded rather than showing an empty strip', () => {
    renderPipeline({
      data: pipelineResponse({
        visualDebug: visualDebug({
          phase: 'searched',
          actualSearches: [braveRequest({ candidates: [] })],
        }),
      }),
    });

    expect(
      screen.getByText(
        'Candidates not recorded for this attempt — re-plan to capture',
      ),
    ).toBeInTheDocument();
  });

  it('puts the caption, the query and the selection on the scene that got the image', () => {
    renderPipeline({
      data: pipelineResponse({ visualDebug: visualDebug({}) }),
      visualDebugByEpisode: {
        [episodeId]: lazyVisualDebug({
          scenes: [
            {
              sceneId: 'scene-01',
              sentenceText: '穩定幣發行商 Tether 又鑄造了十億美元。',
              imageSearchIntent: ['Tether'],
              imageSearchEntities: ['Tether'],
              subjectIds: ['subject-tether'],
              selectionReason: 'direct',
              asset: {
                assetId: 'image-01',
                url: 'https://cdn.example.com/image-01.jpg',
                provider: 'brave',
                license: 'unknown',
                sourcePageUrl: 'https://www.howto.example/tethering',
                width: 1920,
                height: 1080,
                slideHeadline: null,
              },
              trace: [],
              selection: {
                selection: 'pool',
                matchedSubject: 'Tether',
                sourceQuery: 'Tether',
                providerRank: 28,
                fallbackReason: null,
              },
            },
          ],
        }),
      },
    });

    expect(
      screen.getByText('穩定幣發行商 Tether 又鑄造了十億美元。'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('pool · Tether · “Tether” (#28)', { exact: false }),
    ).toBeInTheDocument();
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

    expect(screen.getByText('Planned searches')).toBeInTheDocument();
    expect(
      screen.getByText('a16z · “a16z venture capital firm”'),
    ).toBeInTheDocument();
  });
});
