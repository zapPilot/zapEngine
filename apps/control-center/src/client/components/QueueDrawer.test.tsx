// @vitest-environment jsdom
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

import type {
  PipelineQueueItem,
  SocialQueueItem,
} from '../../shared/pipeline-queues.js';
import type { PodcastVisualDebugResponse } from '../../shared/podcast-visual.js';
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

function socialItem(): SocialQueueItem {
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
    onClose: vi.fn(),
    ...overrides,
  } as Parameters<typeof QueueDrawer>[0];
  render(<QueueDrawer {...props} />);
  return props;
}

describe('QueueDrawer recovery actions', () => {
  it('retries the failed language against its own localization', async () => {
    const props = renderDrawer({ kind: 'render', item: workItem() });

    fireEvent.click(screen.getByRole('button', { name: /Retry ja render/i }));

    await waitFor(() =>
      expect(props.onRestartStep).toHaveBeenCalledWith(EPISODE_ID, {
        step: 'render',
        localizationId: LOCALIZATION_ID,
      }),
    );
  });

  it('restarts the whole video when the visual checkpoint is not reusable', async () => {
    const props = renderDrawer({
      kind: 'render',
      item: workItem({
        state: 'blocked',
        currentStep: 'Stale visual version',
        actions: { restart: { step: 'video', forceReplan: false } },
      }),
    });

    fireEvent.click(screen.getByRole('button', { name: /Restart video/i }));

    await waitFor(() =>
      expect(props.onRestartStep).toHaveBeenCalledWith(EPISODE_ID, {
        step: 'video',
        forceReplan: false,
      }),
    );
  });

  it('explains a refusal instead of offering a button that would 409', () => {
    renderDrawer({
      kind: 'render',
      item: workItem({
        state: 'processing',
        actions: { disabledReason: 'A worker holds this job right now.' },
      }),
    });

    expect(
      screen.getByText('A worker holds this job right now.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Retry|Restart/i }),
    ).not.toBeInTheDocument();
  });

  it('names the operator who closed an abandoned episode and offers nothing', () => {
    renderDrawer({
      kind: 'render',
      item: workItem({
        abandoned: {
          at: '2026-09-04T00:00:00.000Z',
          reason: 'ja render cannot align',
        },
        actions: {
          disabledReason: 'Closed by an operator: ja render cannot align',
        },
      }),
    });

    expect(
      screen.getByText('Closed by an operator: ja render cannot align'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Retry|Restart/i }),
    ).not.toBeInTheDocument();
  });

  it('shows the RPC refusal next to the button that caused it', async () => {
    renderDrawer(
      { kind: 'render', item: workItem() },
      {
        onRestartStep: vi
          .fn()
          .mockRejectedValue(
            new Error('Episode video generation is currently processing'),
          ),
      },
    );

    fireEvent.click(screen.getByRole('button', { name: /Retry ja render/i }));

    expect(
      await screen.findByText(/currently processing/i),
    ).toBeInTheDocument();
  });

  it('offers no retry for social work and says why', () => {
    renderDrawer({ kind: 'social', item: socialItem() });

    expect(
      screen.getByText(/retries these automatically/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/auto-retry at/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Retry|Restart/i })).toBeNull();
  });

  it('shows the full episode UUID so it can be pasted into a query', () => {
    renderDrawer({ kind: 'render', item: workItem() });

    const drawer = screen.getByRole('complementary', {
      name: 'Episode queue details',
    });
    expect(within(drawer).getByText(EPISODE_ID)).toBeInTheDocument();
  });
});

describe('QueueDrawer tabs', () => {
  it('loads visual evidence once when the Scenes tab opens', async () => {
    const props = renderDrawer({ kind: 'render', item: workItem() });

    expect(props.onLoadVisualDebug).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Scenes' }));

    await waitFor(() =>
      expect(props.onLoadVisualDebug).toHaveBeenCalledTimes(1),
    );
    expect(props.onLoadVisualDebug).toHaveBeenCalledWith(EPISODE_ID);
  });

  it('keeps Scenes available for social work, whose episode has already rendered', async () => {
    const props = renderDrawer({ kind: 'social', item: socialItem() });

    fireEvent.click(screen.getByRole('button', { name: 'Scenes' }));

    await waitFor(() =>
      expect(props.onLoadVisualDebug).toHaveBeenCalledWith(EPISODE_ID),
    );
  });

  it('drops the Scenes tab only when the job has no episode row at all', () => {
    renderDrawer({
      kind: 'api',
      item: workItem({
        kind: 'ingest',
        episodeId: undefined,
        actions: {
          disabledReason: 'This ingest never produced an episode row',
        },
      }),
    });

    expect(screen.queryByRole('button', { name: 'Scenes' })).toBeNull();
    expect(screen.getByRole('button', { name: 'History' })).toBeInTheDocument();
  });

  it('arms the re-plan in two clicks and disarms it on tab change', async () => {
    const props = renderDrawer(
      { kind: 'render', item: workItem() },
      {
        visualDebug: visualDebug({
          status: 'completed',
          visualVersion: 'podcast-image-visual-plan.v10',
          visualHash: 'a'.repeat(64),
          attempts: 1,
          lastError: null,
        }),
      },
    );

    fireEvent.click(screen.getByRole('button', { name: 'Scenes' }));
    const replan = await screen.findByRole('button', {
      name: 'Re-plan visuals',
    });

    fireEvent.click(replan);
    expect(props.onRestartStep).not.toHaveBeenCalled();
    const armed = screen.getByRole('button', { name: /Confirm re-plan/i });

    fireEvent.click(armed);
    await waitFor(() =>
      expect(props.onRestartStep).toHaveBeenCalledWith(EPISODE_ID, {
        step: 'video',
        forceReplan: true,
      }),
    );
  });

  it('withholds the re-plan while the plan on screen is already stale', async () => {
    renderDrawer(
      { kind: 'render', item: workItem() },
      {
        visualDebug: visualDebug({
          status: 'completed',
          visualVersion: 'legacy-version',
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

  it('closes on Escape', () => {
    const props = renderDrawer({ kind: 'render', item: workItem() });

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(props.onClose).toHaveBeenCalled();
  });
});
