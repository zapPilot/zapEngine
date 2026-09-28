// @vitest-environment jsdom
/* jscpd:ignore-start -- standard testing-library/vitest boilerplate */
import '@testing-library/jest-dom/vitest';

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  PipelineQueueItem,
  SocialQueueItem,
} from '../../shared/pipeline-queues.js';
import { QueueDrawer, type SelectedQueueEntry } from './QueueDrawer.js';
import type { EpisodeRenderQueueItem } from './episode-queue.js';
/* jscpd:ignore-end */

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
    jobs: [workItem({ key: 'render:ja' })],
    renders: [workItem({ key: 'render:ja' })],
    queuedAt: '2026-09-05T04:00:00.000Z',
    updatedAt: '2026-09-05T04:30:00.000Z',
    history: [],
    publishedLinks: [],
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
        workerId: 'worker-3',
        retryCount: 1,
      },
    ],
    history: [],
    publishedLinks: [],
  };
}

function drawerProps(
  selected: SelectedQueueEntry,
  overrides: Partial<Parameters<typeof QueueDrawer>[0]> = {},
) {
  return {
    selected,
    visualDebug: undefined,
    onLoadVisualDebug: vi.fn().mockResolvedValue({
      status: 'ok',
      message: null,
      episode: {
        id: EPISODE_ID,
        title: 'Why We Build',
        sourceUrl: 'https://e',
      },
      visual: null,
      scenes: [],
      search: null,
      failure: null,
      reviews: [],
      rawPlan: null,
    }),
    onSubmitReview: vi.fn().mockResolvedValue(undefined),
    onResolveReview: vi.fn().mockResolvedValue(undefined),
    onRestartStep: vi.fn().mockResolvedValue(undefined),
    onAbandonEpisode: vi.fn().mockResolvedValue(undefined),
    onClose: vi.fn(),
    ...overrides,
  } as Parameters<typeof QueueDrawer>[0];
}

function renderDrawer(
  selected: SelectedQueueEntry,
  overrides: Partial<Parameters<typeof QueueDrawer>[0]> = {},
) {
  const props = drawerProps(selected, overrides);
  const result = render(<QueueDrawer {...props} />);
  return { props, ...result };
}

describe('QueueDrawer coverage3', () => {
  it('removes its Escape listener when the drawer unmounts', () => {
    const { props, unmount } = renderDrawer({
      kind: 'render',
      item: workItem(),
    });

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(props.onClose).toHaveBeenCalledTimes(1);

    unmount();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('clears restart and abandon errors when a different job is selected', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { props, rerender } = renderDrawer(
      { kind: 'render', item: workItem() },
      {
        onRestartStep: vi.fn().mockRejectedValue(new Error('try again later')),
        onAbandonEpisode: vi
          .fn()
          .mockRejectedValue(new Error('already closed')),
      },
    );

    fireEvent.click(screen.getByRole('button', { name: /Retry ja render/i }));
    expect(await screen.findByText('try again later')).toBeVisible();
    // The retry settles back to idle first: while it is in flight the
    // abandon button is disabled, so the second refusal needs its own click.
    fireEvent.click(screen.getByRole('button', { name: 'Abandon episode' }));
    expect(await screen.findByText('already closed')).toBeVisible();

    // A half-armed re-plan must not survive the switch, and neither must the
    // refusal text from the previous job.
    rerender(
      <QueueDrawer
        {...props}
        selected={{
          kind: 'render',
          item: workItem({ key: 'render:other', title: 'Other episode' }),
        }}
      />,
    );

    await waitFor(() => {
      expect(screen.queryByText('try again later')).toBeNull();
      expect(screen.queryByText('already closed')).toBeNull();
    });
  });

  it('names an aggregated abandon refusal in the recovery section', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderDrawer(
      { kind: 'render', item: aggregatedItem() },
      {
        onAbandonEpisode: vi
          .fn()
          .mockRejectedValue(new Error('already closed elsewhere')),
      },
    );

    fireEvent.click(screen.getByRole('button', { name: 'Abandon episode' }));

    expect(await screen.findByText('already closed elsewhere')).toBeVisible();
  });

  it('shows aggregated recovery without an abandon button when no handler is provided', () => {
    const { props } = renderDrawer(
      { kind: 'render', item: aggregatedItem() },
      { onAbandonEpisode: undefined },
    );

    // The abandon guard needs the handler, so the button stays hidden while
    // the video jobs themselves remain visible.
    expect(props.onAbandonEpisode).toBeUndefined();
    expect(
      screen.queryByRole('button', { name: 'Abandon episode' }),
    ).toBeNull();
    expect(screen.getByText('Video jobs')).toBeVisible();
    expect(screen.getByText('Render · ja')).toBeVisible();
  });

  it('names the worker holding a social lane', () => {
    renderDrawer({ kind: 'social', item: socialItem() });

    expect(screen.getByText('worker · worker-3')).toBeVisible();
  });
});
