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
import type { PipelineQueueItem } from '../../shared/pipeline-queues.js';
import type { PodcastVisualDebugResponse } from '../../shared/podcast-visual.js';
import type { EpisodeRenderQueueItem } from './episode-queue.js';
import { QueueDrawer, type SelectedQueueEntry } from './QueueDrawer.js';

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

describe('QueueDrawer coverage2', () => {
  it('ignores non-Escape keys', () => {
    const props = renderDrawer({ kind: 'render', item: workItem() });
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(props.onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('offers the re-plan for an idle aggregated episode', async () => {
    renderDrawer(
      { kind: 'render', item: aggregatedItem() },
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

  it('withholds the re-plan while an aggregated job is still processing', async () => {
    const busy = aggregatedItem({
      jobs: [
        workItem({
          key: 'visual:busy',
          kind: 'visual',
          state: 'processing',
          abandoned: undefined,
        }),
        workItem({ key: 'render:ja', state: 'failed' }),
      ],
    });
    renderDrawer(
      { kind: 'render', item: busy },
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
    // Processing job means canForceReplan is false: no re-plan button.
    // Visual payload is already cached, so no additional fetch is required.
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: /Re-plan visuals/i }),
      ).toBeNull(),
    );
    expect(
      screen.getByRole('complementary', { name: 'Episode queue details' }),
    ).toBeVisible();
  });

  it('withholds the re-plan while an aggregated job was abandoned', async () => {
    const abandoned = aggregatedItem({
      jobs: [
        workItem({
          key: 'visual:abandoned',
          kind: 'visual',
          state: 'failed',
          abandoned: { at: '2026-09-04T00:00:00.000Z', reason: 'stale' },
        }),
        workItem({ key: 'render:ja', state: 'failed' }),
      ],
    });
    renderDrawer(
      { kind: 'render', item: abandoned },
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
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: /Re-plan visuals/i }),
      ).toBeNull(),
    );
  });

  it('withholds the re-plan for busy single work', async () => {
    renderDrawer(
      {
        kind: 'render',
        item: workItem({ state: 'processing', abandoned: undefined }),
      },
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
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: /Re-plan visuals/i }),
      ).toBeNull(),
    );
  });

  it('labels aggregated jobs without steps and renders fallbacks', () => {
    renderDrawer({
      kind: 'render',
      item: aggregatedItem({
        jobs: [
          workItem({
            key: 'ingest:1',
            kind: 'ingest',
            languageCode: undefined,
            state: 'failed',
            currentStep: undefined,
            workerId: undefined,
            progressPercent: undefined,
            retryCount: 0,
            lastError: undefined,
            abandoned: undefined,
            actions: {},
          }),
          workItem({
            key: 'render:unknown',
            kind: 'render',
            languageCode: undefined,
            state: 'failed',
            currentStep: 'Rendering',
            retryCount: 0,
            lastError: undefined,
            actions: { restart: { step: 'video', forceReplan: false } },
          }),
        ],
      }),
    });
    // ingest without currentStep falls back to Ingest.
    expect(screen.getByText('Ingest')).toBeVisible();
    // render without languageCode falls back to unknown.
    expect(screen.getByText('Render · unknown')).toBeVisible();
  });

  it('does not offer abandon for api work without an episode handler path', () => {
    const props = renderDrawer(
      {
        kind: 'api',
        item: workItem({
          kind: 'ingest',
          episodeId: undefined,
          actions: { restart: { step: 'ingest' } },
        }),
      },
      { onAbandonEpisode: undefined },
    );
    expect(props.onAbandonEpisode).toBeUndefined();
    expect(
      screen.queryByRole('button', { name: 'Abandon episode' }),
    ).toBeNull();
  });
});
