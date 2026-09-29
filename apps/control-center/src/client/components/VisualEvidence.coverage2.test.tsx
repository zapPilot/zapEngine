// @vitest-environment jsdom
/* jscpd:ignore-start -- standard testing-library/vitest boilerplate */
import '@testing-library/jest-dom/vitest';

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { EPISODE_VIDEO_VISUAL_VERSION } from '@zapengine/types/shared';
import type {
  PodcastPipelineVisualDebug,
  PodcastPipelineVisualSearchAttempt,
} from '../../shared/podcast-pipeline.js';
import type {
  PodcastVisualDebugResponse,
  PodcastVisualSceneDebug,
  PodcastVisualReviewHandlers,
} from '../../shared/podcast-visual.js';
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

function sceneFixture(
  overrides: Partial<PodcastVisualSceneDebug> = {},
): PodcastVisualSceneDebug {
  return {
    sceneId: 'scene-01',
    sentenceText: 'Tether minted a billion.',
    imageSearchIntent: ['Tether'],
    imageSearchEntities: ['Tether'],
    subjectIds: ['subject-tether'],
    selectionReason: 'direct',
    asset: {
      assetId: 'image-01',
      url: 'https://cdn.example.com/image-01.jpg',
      provider: 'brave',
      license: 'unknown',
      sourcePageUrl: 'https://example.com',
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
    ...overrides,
  };
}

function renderEvidence(input: {
  pipelineDebug?: PodcastPipelineVisualDebug | null;
  data?: PodcastVisualDebugResponse | undefined;
  onLoadVisualDebug?: ReturnType<typeof vi.fn>;
  onSubmitReview?: ReturnType<typeof vi.fn>;
  onResolveReview?: ReturnType<typeof vi.fn>;
  extra?: Record<string, unknown>;
}) {
  const onLoadVisualDebug =
    input.onLoadVisualDebug ?? vi.fn().mockResolvedValue(debugResponse());
  const onSubmitReview =
    input.onSubmitReview ?? vi.fn().mockResolvedValue(undefined);
  const onResolveReview =
    input.onResolveReview ?? vi.fn().mockResolvedValue(undefined);
  render(
    <VisualEvidence
      data={'data' in input ? input.data : debugResponse()}
      episodeId={episodeId}
      onLoadVisualDebug={
        onLoadVisualDebug as unknown as PodcastVisualReviewHandlers['onLoadVisualDebug']
      }
      onResolveReview={
        onResolveReview as unknown as PodcastVisualReviewHandlers['onResolveReview']
      }
      onSubmitReview={
        onSubmitReview as unknown as PodcastVisualReviewHandlers['onSubmitReview']
      }
      pipelineDebug={input.pipelineDebug ?? null}
      {...(input.extra ?? {})}
    />,
  );
  return { onLoadVisualDebug, onSubmitReview, onResolveReview };
}

describe('VisualEvidence coverage2 filters', () => {
  it('filters to slides only', () => {
    renderEvidence({
      data: debugResponse({
        scenes: [
          sceneFixture({
            sceneId: 'scene-slide',
            sentenceText: 'Slide about Tether',
            imageSearchIntent: ['Tether slide'],
            imageSearchEntities: ['Tether'],
            asset: {
              assetId: 'slide-1',
              url: 'https://cdn.example.com/slide.jpg',
              provider: 'generated-slide',
              license: null,
              sourcePageUrl: null,
              width: null,
              height: null,
              slideHeadline: 'Tether headline',
            },
          }),
          sceneFixture({
            sceneId: 'scene-photo',
            sentenceText: 'Photo of Tether office',
            imageSearchIntent: ['Tether office'],
            imageSearchEntities: ['Tether'],
            asset: {
              assetId: 'photo-1',
              url: 'https://cdn.example.com/photo.jpg',
              provider: 'brave',
              license: null,
              sourcePageUrl: null,
              width: null,
              height: null,
              slideHeadline: null,
            },
          }),
        ],
      }),
    });
    expect(screen.getByText('scene-slide')).toBeVisible();
    expect(screen.getByText('scene-photo')).toBeVisible();
    fireEvent.click(screen.getByLabelText(/slides only/i));
    expect(screen.getByText('scene-slide')).toBeVisible();
    expect(screen.queryByText('scene-photo')).toBeNull();
  });

  it('filters scenes by a text query', () => {
    renderEvidence({
      data: debugResponse({
        scenes: [
          sceneFixture({
            sceneId: 'scene-01',
            sentenceText: 'Tether minted a billion.',
            imageSearchIntent: ['Tether'],
            imageSearchEntities: ['Tether'],
          }),
          sceneFixture({
            sceneId: 'scene-02',
            sentenceText: 'Bitcoin rallied hard.',
            imageSearchIntent: ['Bitcoin'],
            imageSearchEntities: ['Bitcoin'],
          }),
        ],
      }),
    });
    const input = screen.getByLabelText('Filter visual scenes');
    fireEvent.change(input, { target: { value: 'bitcoin' } });
    expect(screen.queryByText('scene-01')).toBeNull();
    expect(screen.getByText('scene-02')).toBeVisible();
    fireEvent.change(input, { target: { value: '' } });
    expect(screen.getByText('scene-01')).toBeVisible();
  });
});

describe('VisualEvidence coverage2 loading errors', () => {
  it('shows the RPC message when the fetch fails with an Error', async () => {
    renderEvidence({
      data: undefined,
      onLoadVisualDebug: vi.fn().mockRejectedValue(new Error('boom-fetch')),
    });
    expect(await screen.findByText('boom-fetch')).toBeVisible();
  });

  it('shows a fallback when the fetch fails without an Error', async () => {
    renderEvidence({
      data: undefined,
      onLoadVisualDebug: vi.fn().mockRejectedValue('string-boom'),
    });
    expect(await screen.findByText('Visual debug failed')).toBeVisible();
  });

  it('does not set an error after unmount (cancelled fetch)', async () => {
    let reject!: (reason: unknown) => void;
    const pending = new Promise<PodcastVisualDebugResponse>((_res, rej) => {
      reject = rej;
    });
    const onLoad = vi.fn().mockReturnValue(pending);
    const { unmount } = render(
      <VisualEvidence
        data={undefined}
        episodeId={episodeId}
        onLoadVisualDebug={onLoad}
        onResolveReview={vi.fn()}
        onSubmitReview={vi.fn()}
        pipelineDebug={null}
      />,
    );
    expect(onLoad).toHaveBeenCalledWith(episodeId);
    unmount();
    reject(new Error('late boom'));
    await new Promise((r) => setTimeout(r, 20));
  });
});

describe('VisualEvidence coverage2 status and failure', () => {
  it('renders a non-ok payload with its message', () => {
    renderEvidence({
      data: debugResponse({ status: 'error', message: 'custom unavailable' }),
    });
    expect(screen.getByText('custom unavailable')).toBeVisible();
  });

  it('renders a non-ok payload without a message', () => {
    renderEvidence({
      data: debugResponse({ status: 'error', message: null }),
    });
    expect(screen.getByText('Visual debug unavailable')).toBeVisible();
  });

  it('renders failure diagnostics with fallbacks', () => {
    renderEvidence({
      data: debugResponse({
        failure: {
          stage: null,
          message: null,
          failedAt: null,
          attempt: null,
          raw: { reason: 'x' },
        },
      }),
    });
    expect(screen.getByText(/unknown stage/)).toBeVisible();
    expect(screen.getByText('No message recorded')).toBeVisible();
    expect(screen.getByText('Raw diagnostics')).toBeVisible();
  });

  it('renders failure diagnostics with values', () => {
    renderEvidence({
      data: debugResponse({
        failure: {
          stage: 'render',
          message: 'gpu died',
          failedAt: '2026-09-05T00:00:00Z',
          attempt: 2,
          raw: {},
        },
      }),
    });
    expect(screen.getByText(/render/)).toBeVisible();
    expect(screen.getByText('gpu died')).toBeVisible();
  });
});

describe('VisualEvidence coverage2 header and budget', () => {
  it('shows no version and unconfigured visual state', () => {
    renderEvidence({
      pipelineDebug: null,
      data: debugResponse({ visual: null }),
    });
    expect(screen.getByText('not scheduled')).toBeInTheDocument();
    expect(screen.getByText('Attempts')).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('shows a visual version fallback when missing', () => {
    renderEvidence({
      data: debugResponse({
        visual: {
          status: 'completed',
          visualVersion: null,
          visualHash: null,
          attempts: 2,
          lastError: null,
        },
      }),
    });
    expect(screen.getByText(/completed · no version/)).toBeVisible();
  });

  it('hides the exhausted hint when the budget is not exhausted', () => {
    renderEvidence({
      pipelineDebug: visualDebug({
        phase: 'searched',
        budget: {
          requestCount: 2,
          max: 8,
          primary: 5,
          targeted: 3,
          exhausted: false,
        },
        actualSearches: [braveRequest({ kind: 'primary' })],
      }),
    });
    expect(
      screen.getByText('requests 2/8 · primary 1/5 · targeted 0/3'),
    ).toBeVisible();
    expect(
      screen.queryByText('Scenes after the last request fell back'),
    ).toBeNull();
  });

  it('lists image reuse per asset', () => {
    renderEvidence({
      pipelineDebug: visualDebug({
        reuse: [
          { assetId: 'img-1', useCount: 3 },
          { assetId: 'img-2', useCount: 2 },
        ],
      }),
    });
    expect(screen.getByText('Image reuse')).toBeVisible();
    expect(screen.getByText('img-1 · 3 scenes')).toBeVisible();
  });

  it('renders the episode review editor and submits', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderEvidence({ data: debugResponse(), onSubmitReview: onSubmit });
    const editors = screen.getAllByText('Save review');
    expect(editors.length).toBeGreaterThan(0);
  });
});

describe('VisualEvidence coverage2 searches', () => {
  it('titles a search with fallbacks and shows a null-provenance candidate', () => {
    renderEvidence({
      pipelineDebug: visualDebug({
        phase: 'searched',
        actualSearches: [
          braveRequest({
            sceneId: null,
            subjectLabel: null,
            kind: null as never,
            provider: 'brave',
            query: 'mystery',
            candidates: [
              {
                imageUrl: 'https://images.example.com/x.png',
                sourceUrl: 'not a url',
                altText: null,
                providerRank: 3,
                dropReason: null,
                selectedBySceneId: null,
              },
            ],
          }),
        ],
      }),
    });
    expect(screen.getByText('search · brave')).toBeVisible();
    expect(screen.getByText('#3 · not a url')).toBeVisible();
  });

  it('shows nothing planned when the checkpoint is empty', () => {
    renderEvidence({
      pipelineDebug: visualDebug({
        primarySubjects: [],
        plannedSubjectSearches: [],
        plannedQueries: [],
      }),
    });
    expect(screen.queryByText('Planned searches')).toBeNull();
  });

  it('renders planned queries with empty subjects and a missing reason', () => {
    renderEvidence({
      pipelineDebug: visualDebug({
        primarySubjects: [{ label: 'a16z', query: 'a16z firm' }],
        plannedQueries: [
          {
            sceneId: 'scene-09',
            subjectIds: [],
            selectionReason: null as unknown as string,
            queries: ['q1', 'q2'],
          },
        ],
      }),
    });
    expect(screen.getByText('Planned searches')).toBeVisible();
    expect(screen.getByText('a16z · “a16z firm”')).toBeVisible();
    expect(screen.getByText('scene-09')).toBeVisible();
    expect(screen.getByText('search')).toBeVisible();
  });
});

describe('VisualEvidence coverage2 scenes', () => {
  it('renders every scene fallback in one pass', () => {
    renderEvidence({
      data: debugResponse({
        scenes: [
          // Bare scene: no asset, no sentence, no intent, no selection.
          sceneFixture({
            sceneId: 'scene-bare',
            sentenceText: null,
            imageSearchIntent: [],
            imageSearchEntities: ['', 'ghost'],
            subjectIds: [],
            selectionReason: null,
            asset: null,
            selection: undefined,
          }),
          // Slide scene with a headline and a crossed-topic fallback.
          sceneFixture({
            sceneId: 'scene-crossed',
            sentenceText: 'Tether minted a billion dollars today.',
            imageSearchIntent: ['Tether'],
            imageSearchEntities: ['Tether', 'extra-context'],
            subjectIds: ['subject-tether'],
            selectionReason: 'direct',
            asset: {
              assetId: 'slide-9',
              url: null,
              provider: null,
              license: null,
              sourcePageUrl: null,
              width: null,
              height: null,
              slideHeadline: 'Tether headline',
            },
            selection: {
              selection: 'pool-fallback',
              matchedSubject: 'Bitcoin',
              sourceQuery: 'Bitcoin news',
              providerRank: null,
              fallbackReason: 'subject-entries-exhausted',
            },
          }),
        ],
        reviews: [
          {
            id: 'review-bare',
            episodeId,
            visualHash: null,
            languageCode: null,
            sceneId: 'scene-bare',
            reviewer: 'operator',
            verdict: 'bad',
            issueCategories: [],
            note: null,
            pipelineContext: {},
            status: 'open',
            resolutionNote: null,
            resolvedBy: null,
            createdAt: '2026-09-05T00:00:00.000Z',
            updatedAt: '2026-09-05T01:00:00.000Z',
          },
          {
            id: 'review-crossed',
            episodeId,
            visualHash: null,
            languageCode: null,
            sceneId: 'scene-crossed',
            reviewer: 'operator',
            verdict: 'bad',
            issueCategories: ['wrong-subject'],
            note: 'looks off',
            pipelineContext: {},
            status: 'open',
            resolutionNote: 'will replan',
            resolvedBy: null,
            createdAt: '2026-09-05T00:00:00.000Z',
            updatedAt: '2026-09-05T01:00:00.000Z',
          },
          // Second review on the same scene hits the grouping duplicate path.
          {
            id: 'review-crossed-2',
            episodeId,
            visualHash: null,
            languageCode: null,
            sceneId: 'scene-crossed',
            reviewer: 'agent',
            verdict: 'acceptable',
            issueCategories: ['other'],
            note: 'second look',
            pipelineContext: {},
            status: 'resolved',
            resolutionNote: 'fixed',
            resolvedBy: 'agent',
            createdAt: '2026-09-05T00:00:00.000Z',
            updatedAt: '2026-09-05T01:00:00.000Z',
          },
        ],
      }),
    });
    expect(screen.getAllByText('No asset').length).toBeGreaterThan(0);
    expect(screen.getAllByText('none').length).toBeGreaterThan(0);
    expect(screen.getByText('Tether headline')).toBeInTheDocument();
    expect(
      screen.getByText('Sentence text not persisted for this version.'),
    ).toBeVisible();
    expect(
      screen.getByText('no literal visual anchor found in this narration'),
    ).toBeVisible();
    expect(screen.getByText('no planned Brave query')).toBeVisible();
    expect(
      screen.getByText('reuse / generated / non-Brave asset'),
    ).toBeVisible();
    expect(screen.getByText(/Fallback crossed topic/)).toBeVisible();
    expect(
      screen.getAllByText(/context \/ ungrounded anchors/).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText('no issue category')).toBeVisible();
    expect(screen.getByText('will replan')).toBeVisible();
    // Unresolved review offers a Resolve button.
    expect(screen.getAllByText('Resolve').length).toBeGreaterThan(0);
    // Selection line covers rank-null, sourceQuery and fallback variants.
    expect(screen.getByText(/pool-fallback/)).toBeInTheDocument();
  });

  it('resolves an open review from the scene', async () => {
    const onResolve = vi.fn().mockResolvedValue(undefined);
    renderEvidence({
      data: debugResponse({
        scenes: [sceneFixture({ sceneId: 'scene-01' })],
        reviews: [
          {
            id: 'review-open',
            episodeId,
            visualHash: null,
            languageCode: null,
            sceneId: 'scene-01',
            reviewer: 'operator',
            verdict: 'bad',
            issueCategories: ['wrong-subject'],
            note: 'bad photo',
            pipelineContext: {},
            status: 'open',
            resolutionNote: null,
            resolvedBy: null,
            createdAt: '2026-09-05T00:00:00.000Z',
            updatedAt: '2026-09-05T01:00:00.000Z',
          },
        ],
      }),
      onResolveReview: onResolve,
    });
    fireEvent.click(screen.getByText('Resolve'));
    await waitFor(() =>
      expect(onResolve).toHaveBeenCalledWith(episodeId, 'review-open', {
        status: 'resolved',
        resolutionNote: 'Verified from Control Center',
      }),
    );
  });

  it('renders a scene selection without a source query', () => {
    renderEvidence({
      data: debugResponse({
        scenes: [
          sceneFixture({
            sceneId: 'scene-nosrc',
            selection: {
              selection: 'reuse',
              matchedSubject: null,
              sourceQuery: null,
              providerRank: 5,
              fallbackReason: null,
            },
          }),
        ],
      }),
    });
    expect(screen.getByText('scene-nosrc')).toBeVisible();
  });
});

describe('VisualEvidence coverage2 force replan', () => {
  it('renders an enabled re-plan when busy is undefined', async () => {
    render(
      <VisualEvidence
        data={debugResponse({
          visual: {
            status: 'completed',
            visualVersion: EPISODE_VIDEO_VISUAL_VERSION,
            visualHash: 'a'.repeat(64),
            attempts: 1,
            lastError: null,
          },
        })}
        episodeId={episodeId}
        onForceReplan={vi.fn()}
        onLoadVisualDebug={vi.fn().mockResolvedValue(debugResponse())}
        onResolveReview={vi.fn()}
        onSubmitReview={vi.fn()}
        pipelineDebug={null}
      />,
    );
    const button = screen.getByRole('button', { name: 'Re-plan visuals' });
    expect(button).toBeEnabled();
  });

  it('shows a busy re-plan label', async () => {
    render(
      <VisualEvidence
        data={debugResponse({
          visual: {
            status: 'completed',
            visualVersion: EPISODE_VIDEO_VISUAL_VERSION,
            visualHash: 'a'.repeat(64),
            attempts: 1,
            lastError: null,
          },
        })}
        episodeId={episodeId}
        forceReplanBusy
        onForceReplan={vi.fn()}
        onLoadVisualDebug={vi.fn().mockResolvedValue(debugResponse())}
        onResolveReview={vi.fn()}
        onSubmitReview={vi.fn()}
        pipelineDebug={null}
      />,
    );
    expect(screen.getByRole('button', { name: 'Re-planning…' })).toBeDisabled();
  });
});

describe('VisualEvidence coverage2 review editor', () => {
  it('toggles issues, edits verdict and note, and saves', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderEvidence({ data: debugResponse(), onSubmitReview: onSubmit });
    const editor = screen
      .getByLabelText('Episode review note')
      .closest('.podcast-review-editor') as HTMLElement;
    const issue = within(editor).getByLabelText('wrong-subject');
    fireEvent.click(issue);
    expect((issue as HTMLInputElement).checked).toBe(true);
    fireEvent.click(issue);
    expect((issue as HTMLInputElement).checked).toBe(false);
    fireEvent.click(issue);
    fireEvent.change(screen.getByLabelText('Episode verdict'), {
      target: { value: 'bad' },
    });
    fireEvent.change(screen.getByLabelText('Episode review note'), {
      target: { value: '  needs work  ' },
    });
    fireEvent.click(within(editor).getByText('Save review'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const payload = onSubmit.mock.calls[0]![1] as {
      sceneId: null;
      verdict: string;
      note: string | null;
      issueCategories: string[];
    };
    expect(payload.sceneId).toBeNull();
    expect(payload.verdict).toBe('bad');
    expect(payload.note).toBe('needs work');
    expect(payload.issueCategories).toContain('wrong-subject');
  });

  it('saves an empty note as null and shows the saving state', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const onSubmit = vi.fn().mockReturnValue(gate);
    renderEvidence({ data: debugResponse(), onSubmitReview: onSubmit });
    const editor = screen
      .getByLabelText('Episode review note')
      .closest('.podcast-review-editor') as HTMLElement;
    fireEvent.click(within(editor).getByText('Save review'));
    expect(await screen.findByText('Saving…')).toBeInTheDocument();
    release();
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const payload = onSubmit.mock.calls[0]![1] as { note: unknown };
    expect(payload.note).toBeNull();
    await waitFor(() =>
      expect(screen.getByText('Save review')).toBeInTheDocument(),
    );
  });

  it('submits a scene-scoped review with the scene id', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderEvidence({
      data: debugResponse({ scenes: [sceneFixture({ sceneId: 'scene-01' })] }),
      onSubmitReview: onSubmit,
    });
    const note = screen.getByLabelText('scene-01 review note');
    const editor = note.closest('.podcast-review-editor') as HTMLElement;
    fireEvent.change(note, { target: { value: 'scene note' } });
    fireEvent.click(within(editor).getByText('Save review'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const payload = onSubmit.mock.calls[0]![1] as { sceneId: string };
    expect(payload.sceneId).toBe('scene-01');
  });
});
