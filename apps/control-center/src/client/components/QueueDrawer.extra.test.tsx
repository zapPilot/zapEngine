// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { EPISODE_VIDEO_VISUAL_VERSION } from '@zapengine/types/shared';
import type {
  PipelineQueueItem,
  SocialQueueItem,
} from '../../shared/pipeline-queues.js';
import type { PodcastVisualDebugResponse } from '../../shared/podcast-visual.js';
import type { EpisodeRenderQueueItem } from './episode-queue.js';
import {
  canAbandon,
  formatDateTime,
  QueueDrawer,
  restartHint,
  restartLabel,
  type SelectedQueueEntry,
} from './QueueDrawer.js';

const EPISODE_ID = '11111111-1111-4111-8111-111111111111';
const LOCALIZATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function workItem(
  overrides: Partial<PipelineQueueItem> = {},
): PipelineQueueItem {
  return {
    key: `render:${EPISODE_ID}`,
    kind: 'render',
    episodeId: EPISODE_ID,
    title: 'Why We Build',
    languageCode: 'ja',
    state: 'failed',
    queuedAt: '2026-09-05T04:00:00.000Z',
    updatedAt: '2026-09-05T04:30:00.000Z',
    currentStep: 'Rendering',
    retryCount: 2,
    lastError: 'Raster resvg stage failed (signal SIGKILL)',
    history: [{ at: '2026-09-05T04:00:00.000Z', label: 'Added to queue' }],
    publishedLinks: [],
    actions: { restart: { step: 'render', localizationId: LOCALIZATION_ID } },
    ...overrides,
  };
}

function aggregatedItem(
  overrides: Partial<EpisodeRenderQueueItem> = {},
): EpisodeRenderQueueItem {
  return {
    key: `episode:${EPISODE_ID}`,
    episodeId: EPISODE_ID,
    title: 'Why We Build',
    state: 'failed',
    jobs: [
      workItem({
        key: `visual:${EPISODE_ID}`,
        kind: 'visual',
        languageCode: undefined,
        state: 'failed',
        currentStep: 'Visual planning',
        retryCount: 0,
        lastError: undefined,
        actions: { restart: { step: 'video', forceReplan: false } },
      }),
      workItem({ key: 'render:ja' }),
    ],
    renders: [workItem({ key: 'render:ja' })],
    queuedAt: '2026-09-05T04:00:00.000Z',
    updatedAt: '2026-09-05T04:30:00.000Z',
    history: [],
    publishedLinks: [],
    ...overrides,
  };
}

function socialItem(overrides: Partial<SocialQueueItem> = {}): SocialQueueItem {
  return {
    key: `social:${EPISODE_ID}`,
    episodeId: EPISODE_ID,
    title: 'Why We Build',
    contentType: 'video',
    scheduledAt: '2026-09-05T05:30:00.000Z',
    state: 'queued',
    platforms: [
      {
        platform: 'x',
        languageCode: 'en',
        status: 'queued',
        scheduledAt: '2026-09-05T05:30:00.000Z',
        nextAttemptAt: '2026-09-05T06:30:00.000Z',
        retryCount: 1,
      },
    ],
    history: [],
    publishedLinks: [],
    ...overrides,
  };
}

function visualDebug(
  visual: PodcastVisualDebugResponse['visual'],
): PodcastVisualDebugResponse {
  return {
    status: 'ok',
    message: null,
    episode: { id: EPISODE_ID, title: 'Why We Build', sourceUrl: 'https://e' },
    visual,
    scenes: [],
    search: null,
    failure: null,
    reviews: [],
    rawPlan: null,
  };
}

function renderDrawer(
  selected: SelectedQueueEntry,
  overrides: Partial<Parameters<typeof QueueDrawer>[0]> = {},
) {
  const props = {
    selected,
    visualDebug: undefined,
    onLoadVisualDebug: vi.fn().mockResolvedValue(visualDebug(null)),
    onSubmitReview: vi.fn().mockResolvedValue(undefined),
    onResolveReview: vi.fn().mockResolvedValue(undefined),
    onRestartStep: vi.fn().mockResolvedValue(undefined),
    onAbandonEpisode: vi.fn().mockResolvedValue(undefined),
    onClose: vi.fn(),
    ...overrides,
  } as Parameters<typeof QueueDrawer>[0];
  render(<QueueDrawer {...props} />);
  return props;
}

describe('QueueDrawer chrome', () => {
  it('closes from its close button', () => {
    const props = renderDrawer({ kind: 'render', item: workItem() });

    fireEvent.click(screen.getByRole('button', { name: 'Close details' }));

    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it('says there is no episode row instead of copying nothing', () => {
    renderDrawer({
      kind: 'api',
      item: workItem({
        kind: 'ingest',
        episodeId: undefined,
        actions: { restart: { step: 'ingest' } },
      }),
    });

    expect(screen.getByText('no episode row')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: /Copy episode id/ }),
    ).toBeNull();
  });

  it('resets to Overview when a different job is selected', () => {
    const props = {
      selected: { kind: 'render', item: workItem() } as SelectedQueueEntry,
      visualDebug: undefined,
      onLoadVisualDebug: vi.fn().mockResolvedValue(visualDebug(null)),
      onSubmitReview: vi.fn().mockResolvedValue(undefined),
      onResolveReview: vi.fn().mockResolvedValue(undefined),
      onRestartStep: vi.fn().mockResolvedValue(undefined),
      onClose: vi.fn(),
    } as Parameters<typeof QueueDrawer>[0];
    const { rerender } = render(<QueueDrawer {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'History' }));
    expect(screen.getByText('Queue history')).toBeVisible();

    const next = workItem({ key: 'render:other', title: 'Other episode' });
    rerender(
      <QueueDrawer {...props} selected={{ kind: 'render', item: next }} />,
    );

    expect(screen.getByText('Recovery')).toBeVisible();
    expect(screen.queryByText('Queue history')).toBeNull();
  });
});

describe('QueueDrawer overview', () => {
  it('spells out the last error for single work', () => {
    renderDrawer({ kind: 'render', item: workItem() });

    expect(screen.getByText('Last error')).toBeVisible();
    expect(
      screen.getByText('Raster resvg stage failed (signal SIGKILL)'),
    ).toBeVisible();
  });

  it('hides the last-error section when there is none', () => {
    renderDrawer({
      kind: 'render',
      item: workItem({ lastError: undefined }),
    });

    expect(screen.queryByText('Last error')).toBeNull();
  });

  it('lists the current state with worker, progress, retries and abandonment', () => {
    renderDrawer({
      kind: 'api',
      item: workItem({
        kind: 'ingest',
        languageCode: undefined,
        currentStep: undefined,
        workerId: 'worker-7',
        progressPercent: 42,
        retryCount: 0,
        lastError: undefined,
        abandoned: { at: '2026-09-04T00:00:00.000Z', reason: 'stale' },
        actions: {},
      }),
    });

    expect(screen.getByText('worker-7')).toBeVisible();
    expect(screen.getByText('42%')).toBeVisible();
    expect(screen.getByText(/stale/)).toBeVisible();
  });

  it('does nothing when a job without an episode row is retried', () => {
    const props = renderDrawer({
      kind: 'api',
      item: workItem({
        kind: 'ingest',
        episodeId: undefined,
        actions: { restart: { step: 'ingest' } },
      }),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Restart ingest' }));

    expect(props.onRestartStep).not.toHaveBeenCalled();
  });

  it('reports a non-Error restart refusal as a plain retry failure', async () => {
    renderDrawer(
      { kind: 'render', item: workItem() },
      { onRestartStep: vi.fn().mockRejectedValue('string-boom') },
    );

    fireEvent.click(screen.getByRole('button', { name: /Retry ja render/i }));

    expect(await screen.findByText('Retry failed')).toBeVisible();
  });
});

describe('QueueDrawer abandon flow', () => {
  it('abandons on confirmation and closes the drawer', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const props = renderDrawer({ kind: 'render', item: workItem() });

    fireEvent.click(screen.getByRole('button', { name: 'Abandon episode' }));

    await waitFor(() =>
      expect(props.onAbandonEpisode).toHaveBeenCalledWith(EPISODE_ID),
    );
    expect(props.onClose).toHaveBeenCalled();
  });

  it('leaves the episode alone when the operator cancels', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const props = renderDrawer({ kind: 'render', item: workItem() });

    fireEvent.click(screen.getByRole('button', { name: 'Abandon episode' }));

    expect(props.onAbandonEpisode).not.toHaveBeenCalled();
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('shows an abandon refusal next to the button that caused it', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderDrawer(
      { kind: 'render', item: workItem() },
      {
        onAbandonEpisode: vi
          .fn()
          .mockRejectedValue(new Error('already closed')),
      },
    );

    fireEvent.click(screen.getByRole('button', { name: 'Abandon episode' }));

    expect(await screen.findByText('already closed')).toBeVisible();
  });

  it('reports a non-Error abandon refusal as a plain failure', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderDrawer(
      { kind: 'render', item: workItem() },
      { onAbandonEpisode: vi.fn().mockRejectedValue('string-boom') },
    );

    fireEvent.click(screen.getByRole('button', { name: 'Abandon episode' }));

    expect(await screen.findByText('Abandon failed')).toBeVisible();
  });

  it('offers no abandon without a handler, even for failed work', () => {
    renderDrawer(
      { kind: 'render', item: workItem() },
      { onAbandonEpisode: undefined },
    );

    expect(
      screen.queryByRole('button', { name: 'Abandon episode' }),
    ).toBeNull();
  });
});

describe('QueueDrawer aggregated render episodes', () => {
  it('lists every video job with its worker, progress, retries and errors', () => {
    renderDrawer({
      kind: 'render',
      item: aggregatedItem({
        jobs: [
          workItem({
            key: `visual:${EPISODE_ID}`,
            kind: 'visual',
            languageCode: undefined,
            state: 'processing',
            currentStep: 'Visual planning',
            workerId: 'worker-1',
            progressPercent: 150,
            retryCount: 1,
            lastError: undefined,
            actions: {
              disabledReason: 'A worker holds this job right now.',
            },
          }),
          workItem({
            key: 'render:ja',
            workerId: undefined,
            progressPercent: undefined,
            retryCount: 0,
            abandoned: { at: '2026-09-04T00:00:00.000Z', reason: 'stale' },
          }),
        ],
      }),
    });

    expect(screen.getByText('Video jobs')).toBeVisible();
    expect(screen.getByText('Visual')).toBeVisible();
    expect(screen.getByText('Render · ja')).toBeVisible();
    // Episode jobs print the raw progress figure, unclamped.
    expect(screen.getByText('150%')).toBeVisible();
    expect(
      screen.getByText('A worker holds this job right now.'),
    ).toBeVisible();
    expect(screen.getByText(/stale/)).toBeVisible();
  });

  it('explains why nothing can be retried when every job is held', () => {
    const held = (key: string) =>
      workItem({
        key,
        state: 'processing',
        actions: { disabledReason: 'A worker holds this job right now.' },
      });
    renderDrawer({
      kind: 'render',
      item: aggregatedItem({
        state: 'processing',
        jobs: [held('a'), held('b')],
      }),
    });

    expect(
      screen.getAllByText('A worker holds this job right now.').length,
    ).toBeGreaterThanOrEqual(2);
    expect(
      screen.queryByRole('button', { name: 'Abandon episode' }),
    ).toBeNull();
  });

  it('abandons an aggregated episode from its recovery section', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const props = renderDrawer({ kind: 'render', item: aggregatedItem() });

    fireEvent.click(screen.getByRole('button', { name: 'Abandon episode' }));

    await waitFor(() =>
      expect(props.onAbandonEpisode).toHaveBeenCalledWith(EPISODE_ID),
    );
    expect(props.onClose).toHaveBeenCalled();
  });

  it('names an aggregated restart refusal in the recovery section', async () => {
    renderDrawer(
      { kind: 'render', item: aggregatedItem() },
      {
        onRestartStep: vi
          .fn()
          .mockRejectedValue(new Error('video is processing')),
      },
    );

    fireEvent.click(screen.getByRole('button', { name: /Restart video/i }));

    // The refusal surfaces both beside the job and in the recovery section.
    expect(await screen.findAllByText('video is processing')).toHaveLength(2);
  });
});

describe('QueueDrawer social work', () => {
  it('links a published post and admits a missing link', () => {
    renderDrawer({
      kind: 'social',
      item: socialItem({
        platforms: [
          {
            platform: 'x',
            languageCode: 'en',
            status: 'published',
            scheduledAt: '2026-09-05T05:30:00.000Z',
            publishedAt: '2026-09-05T05:35:00.000Z',
            url: 'https://x.com/zap/status/1',
            retryCount: 0,
          },
          {
            platform: 'threads',
            languageCode: 'en',
            status: 'published',
            scheduledAt: '2026-09-05T05:30:00.000Z',
            publishedAt: '2026-09-05T05:35:00.000Z',
            retryCount: 0,
          },
        ],
      }),
    });

    expect(screen.getByRole('link', { name: /Open post/ })).toHaveAttribute(
      'href',
      'https://x.com/zap/status/1',
    );
    expect(screen.getByText('Published · link unavailable')).toBeVisible();
    // A published lane has no next attempt to report.
    expect(screen.queryByText(/auto-retry at/)).toBeNull();
  });

  it('shows lane errors for queued work', () => {
    renderDrawer({
      kind: 'social',
      item: socialItem({
        platforms: [
          {
            platform: 'youtube',
            languageCode: 'en',
            status: 'failed',
            scheduledAt: '2026-09-05T05:30:00.000Z',
            error: 'upload rejected',
            retryCount: 2,
          },
        ],
      }),
    });

    expect(screen.getByText('upload rejected')).toBeVisible();
    expect(screen.getByText('retry 2')).toBeVisible();
  });

  it('offers the re-plan on the scenes tab for rendered social work', async () => {
    renderDrawer(
      { kind: 'social', item: socialItem() },
      {
        visualDebug: visualDebug({
          status: 'completed',
          visualVersion: EPISODE_VIDEO_VISUAL_VERSION,
          visualHash: 'a'.repeat(64),
          attempts: 1,
          lastError: null,
        }),
      },
    );

    fireEvent.click(screen.getByRole('button', { name: 'Scenes' }));

    expect(
      await screen.findByRole('button', { name: 'Re-plan visuals' }),
    ).toBeVisible();
  });
});

describe('QueueDrawer published links and history', () => {
  it('links published posts and admits a missing link', () => {
    renderDrawer({
      kind: 'render',
      item: workItem({
        publishedLinks: [
          {
            platform: 'x',
            languageCode: 'en',
            publishedAt: '2026-09-05T05:35:00.000Z',
            url: 'https://x.com/zap/status/1',
          },
          {
            platform: 'threads',
            languageCode: 'en',
            publishedAt: '2026-09-05T05:35:00.000Z',
            url: null,
          },
        ],
      }),
    });

    expect(
      screen.getByRole('link', { name: /https:\/\/x.com\/zap\/status\/1/ }),
    ).toHaveAttribute('href', 'https://x.com/zap/status/1');
    expect(screen.getByText('Published · link unavailable')).toBeVisible();
  });

  it('says no post has been published yet', () => {
    renderDrawer({ kind: 'render', item: workItem() });

    expect(screen.getByText('No published posts yet.')).toBeVisible();
  });

  it('lists history and skips raw URL details', () => {
    renderDrawer({
      kind: 'render',
      item: workItem({
        history: [
          { at: '2026-09-05T04:00:00.000Z', label: 'Added to queue' },
          {
            at: '2026-09-05T05:35:00.000Z',
            label: 'x published',
            detail: 'https://x.com/zap/status/1',
          },
          {
            at: '2026-09-05T05:36:00.000Z',
            label: 'noted',
            detail: 'operator note',
          },
        ],
      }),
    });

    fireEvent.click(screen.getByRole('button', { name: 'History' }));

    expect(screen.getByText('Added to queue')).toBeVisible();
    expect(screen.getByText('operator note')).toBeVisible();
    expect(screen.queryByText('https://x.com/zap/status/1')).toBeNull();
  });

  it('admits an empty history', () => {
    renderDrawer({ kind: 'render', item: aggregatedItem() });

    fireEvent.click(screen.getByRole('button', { name: 'History' }));

    expect(screen.getByText('No reliable persisted history.')).toBeVisible();
  });
});

describe('QueueDrawer helpers', () => {
  it.each([
    [{ step: 'ingest' }, 'Restart ingest'],
    [{ step: 'render', localizationId: LOCALIZATION_ID }, 'Retry ja render'],
    [{ step: 'render' }, 'Retry render'],
    [{ step: 'video', forceReplan: false }, 'Restart video'],
  ])('labels %j as %s', (action, label) => {
    expect(
      restartLabel(
        action as Parameters<typeof restartLabel>[0],
        workItem({
          languageCode:
            action.step === 'render' && 'localizationId' in action
              ? 'ja'
              : undefined,
        }),
      ),
    ).toBe(label);
  });

  it.each([
    [
      { step: 'ingest' },
      'Resumes translation and TTS from durable checkpoints.',
    ],
    [
      { step: 'render' },
      'Requeues this language against the existing visual plan.',
    ],
    [
      { step: 'video' },
      'Re-plans the visual if needed, then requeues the unfinished renders.',
    ],
  ])('hints %j', (action, hint) => {
    expect(restartHint(action as Parameters<typeof restartHint>[0])).toBe(hint);
  });

  it('offers abandon for a failed aggregated episode only while it is rescueable', () => {
    expect(canAbandon({ kind: 'render', item: aggregatedItem() })).toBe(true);
    expect(
      canAbandon({
        kind: 'render',
        item: aggregatedItem({ state: 'processing' }),
      }),
    ).toBe(false);
  });

  it('withholds abandon once an aggregated job was already closed', () => {
    const item = aggregatedItem();
    item.jobs[0] = workItem({
      key: 'abandoned',
      abandoned: { at: '2026-09-04T00:00:00.000Z', reason: 'stale' },
    });
    expect(canAbandon({ kind: 'render', item })).toBe(false);
  });

  it('withholds abandon from api work', () => {
    expect(canAbandon({ kind: 'api', item: workItem() })).toBe(false);
  });

  it('formats queue timestamps for operators', () => {
    const formatted = formatDateTime('2026-09-05T05:30:00.000Z');
    expect(formatted).toContain('Sept');
    expect(formatted).toMatch(/\d{2}:\d{2}/);
  });
});
