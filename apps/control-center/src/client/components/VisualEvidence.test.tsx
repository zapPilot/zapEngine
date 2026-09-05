// @vitest-environment jsdom
/* jscpd:ignore-start -- standard testing-library/vitest boilerplate */
import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  PodcastPipelineVisualDebug,
  PodcastPipelineVisualSearchAttempt,
} from '../../shared/podcast-pipeline.js';
import type { PodcastVisualDebugResponse } from '../../shared/podcast-visual.js';
import { VisualEvidence } from './VisualEvidence.js';
/* jscpd:ignore-end */

const episodeId = '826f4b87-6278-4275-bff5-535ba5ef438d';

afterEach(cleanup);

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

function debugResponse(
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
    search: null,
    failure: null,
    reviews: [],
    rawPlan: null,
    ...overrides,
  };
}

function renderEvidence(input: {
  pipelineDebug?: PodcastPipelineVisualDebug | null;
  data?: PodcastVisualDebugResponse | undefined;
}) {
  const onLoadVisualDebug = vi.fn().mockResolvedValue(debugResponse());
  render(
    <VisualEvidence
      data={'data' in input ? input.data : debugResponse()}
      episodeId={episodeId}
      onLoadVisualDebug={onLoadVisualDebug}
      onResolveReview={vi.fn()}
      onSubmitReview={vi.fn()}
      pipelineDebug={input.pipelineDebug ?? null}
    />,
  );
  return { onLoadVisualDebug };
}

describe('VisualEvidence loading', () => {
  it('fetches the evidence when it mounts without a cached payload', () => {
    const { onLoadVisualDebug } = renderEvidence({ data: undefined });

    expect(onLoadVisualDebug).toHaveBeenCalledWith(episodeId);
  });

  it('does not refetch evidence that is already cached', () => {
    const { onLoadVisualDebug } = renderEvidence({});

    expect(onLoadVisualDebug).not.toHaveBeenCalled();
  });
});

describe('VisualEvidence searches', () => {
  it('flags the missing trace and lists what the attempt intended to search', () => {
    renderEvidence({ pipelineDebug: visualDebug({}) });

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
    renderEvidence({
      pipelineDebug: visualDebug({
        phase: 'searched',
        actualSearches: [braveRequest({ query: 'a16z' })],
      }),
    });

    expect(screen.getByText('Searches')).toBeInTheDocument();
    expect(screen.queryByText('Planned searches')).not.toBeInTheDocument();
    expect(screen.queryByText('Andreessen Horowitz')).not.toBeInTheDocument();
  });

  it('reports the episode request budget against its per-episode ceiling', () => {
    renderEvidence({
      pipelineDebug: visualDebug({
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
    });

    expect(
      screen.getByText('requests 6/8 · primary 5/5 · targeted 1/3 · exhausted'),
    ).toBeInTheDocument();
  });

  it('lists a primary request by subject and shows its drops and provider error', () => {
    renderEvidence({
      pipelineDebug: visualDebug({
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
    renderEvidence({
      pipelineDebug: visualDebug({
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
    renderEvidence({
      pipelineDebug: visualDebug({
        phase: 'searched',
        actualSearches: [braveRequest({ candidates: [] })],
      }),
    });

    expect(
      screen.getByText(
        'Candidates not recorded for this attempt — re-plan to capture',
      ),
    ).toBeInTheDocument();
  });

  it('shows the subject queries a planned checkpoint intended to spend', () => {
    renderEvidence({
      pipelineDebug: visualDebug({
        plannedSubjectSearches: [
          { label: 'a16z', query: 'a16z venture capital firm' },
        ],
      }),
    });

    expect(screen.getByText('Planned searches')).toBeInTheDocument();
    expect(
      screen.getByText('a16z · “a16z venture capital firm”'),
    ).toBeInTheDocument();
  });
});

describe('VisualEvidence scenes and catalog', () => {
  it('puts the caption, the query and the selection on the scene that got the image', () => {
    renderEvidence({
      pipelineDebug: visualDebug({}),
      data: debugResponse({
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
    });

    expect(
      screen.getByText('穩定幣發行商 Tether 又鑄造了十億美元。'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('pool · Tether · “Tether” (#28)', { exact: false }),
    ).toBeInTheDocument();
  });

  it('names the reason a degraded subject catalog is missing', () => {
    renderEvidence({
      pipelineDebug: visualDebug({
        primarySubject: null,
        subjects: [],
        subjectCatalogFailure: 'subject catalog answer named no known subject',
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
    renderEvidence({
      pipelineDebug: visualDebug({ primarySubject: null, subjects: [] }),
    });

    expect(screen.getByText('No subject catalog recorded')).toBeInTheDocument();
    expect(screen.queryByText(/catalog degraded/u)).not.toBeInTheDocument();
  });

  it('surfaces how a resolved review was closed', () => {
    renderEvidence({
      data: debugResponse({
        reviews: [
          {
            id: 'review-1',
            episodeId,
            visualHash: 'f'.repeat(64),
            languageCode: null,
            sceneId: null,
            reviewer: 'operator',
            verdict: 'bad',
            issueCategories: ['wrong-subject'],
            note: 'Photo of a charging cable',
            pipelineContext: {},
            status: 'resolved',
            resolutionNote: 'Re-planned at v10',
            resolvedBy: 'agent',
            createdAt: '2026-09-05T00:00:00.000Z',
            updatedAt: '2026-09-05T01:00:00.000Z',
          },
        ],
      }),
    });

    expect(screen.getByText('agent: Re-planned at v10')).toBeInTheDocument();
  });
});
