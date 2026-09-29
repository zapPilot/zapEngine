// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  PipelineQueueItem,
  PipelineQueuesResponse,
} from '../../shared/pipeline-queues.js';
import { PipelineQueuesBoard } from './PipelineQueuesBoard.js';

const EPISODE_ID = '11111111-1111-4111-8111-111111111111';
const TIMER_HANDLE = 1 as unknown as ReturnType<typeof window.setInterval>;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const emptyLane = { attention: [], processing: [], queued: [] };

function queues(
  overrides: Partial<PipelineQueuesResponse> = {},
): PipelineQueuesResponse {
  return {
    api: emptyLane,
    generatedAt: '2026-09-05T06:00:00.000Z',
    status: 'ok',
    message: null,
    summary: {
      queueDepth: 0,
      processing: 0,
      blockedOrFailed: 0,
      publishedToday: 0,
      abandoned: 0,
    },
    render: emptyLane,
    social: emptyLane,
    ...overrides,
  } as PipelineQueuesResponse;
}

function workItem(
  overrides: Partial<PipelineQueueItem> = {},
): PipelineQueueItem {
  return {
    key: `api:${EPISODE_ID}`,
    kind: 'ingest',
    episodeId: EPISODE_ID,
    title: 'Morning ingest',
    state: 'failed',
    queuedAt: '2026-09-05T04:00:00.000Z',
    updatedAt: '2026-09-05T04:30:00.000Z',
    retryCount: 0,
    history: [],
    publishedLinks: [],
    actions: { restart: { step: 'ingest' } },
    ...overrides,
  };
}

function response(payload: PipelineQueuesResponse): Response {
  return new Response(JSON.stringify(payload), {
    headers: { 'content-type': 'application/json' },
  });
}

function boardProps(
  overrides: Partial<Parameters<typeof PipelineQueuesBoard>[0]> = {},
) {
  return {
    onLoadVisualDebug: vi.fn().mockResolvedValue(undefined),
    onResolveReview: vi.fn().mockResolvedValue(undefined),
    onRestartStep: vi.fn().mockResolvedValue(undefined),
    onSubmitReview: vi.fn().mockResolvedValue(undefined),
    visualDebugByEpisode: {},
    ...overrides,
  } as Parameters<typeof PipelineQueuesBoard>[0];
}

function stubPoll(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal('fetch', fetchMock);
  if (typeof window !== 'undefined') {
    (window as unknown as { fetch: typeof fetch }).fetch =
      fetchMock as unknown as typeof fetch;
  }
  vi.spyOn(window, 'setInterval').mockImplementation(() => TIMER_HANDLE);
}

describe('PipelineQueuesBoard coverage3', () => {
  it('renders an aggregated episode thumbnail', async () => {
    stubPoll(
      vi.fn().mockResolvedValue(
        response(
          queues({
            render: {
              ...emptyLane,
              queued: [
                {
                  ...workItem({
                    key: 'visual:ep-thumb',
                    kind: 'visual',
                    state: 'queued',
                    currentStep: 'planning-scenes',
                    startedAt: undefined,
                    queuedAt: '2026-09-05T04:00:00.000Z',
                  }),
                  episodeId: EPISODE_ID,
                  title: 'Episode With Thumb',
                },
                {
                  ...workItem({
                    key: 'render:ep-thumb-en',
                    kind: 'render',
                    languageCode: 'en',
                    state: 'queued',
                    currentStep: 'Rendering',
                    thumbnailUrl: 'https://cdn.example.com/thumb.jpg',
                    startedAt: undefined,
                    queuedAt: '2026-09-05T04:00:00.000Z',
                  }),
                  episodeId: EPISODE_ID,
                  title: 'Episode With Thumb',
                },
              ],
            } as never,
          }),
        ),
      ),
    );
    render(<PipelineQueuesBoard {...boardProps()} />);
    expect(await screen.findByText('Episode With Thumb')).toBeVisible();
    const thumbs = document.querySelectorAll('img.queue-thumb');
    expect(thumbs.length).toBeGreaterThan(0);
    expect(thumbs[0]?.getAttribute('src')).toBe(
      'https://cdn.example.com/thumb.jpg',
    );
  });

  it('renders an aggregated episode with no timing at all', async () => {
    stubPoll(
      vi.fn().mockResolvedValue(
        response(
          queues({
            render: {
              ...emptyLane,
              queued: [
                {
                  ...workItem({
                    key: 'visual:ep-notime',
                    kind: 'visual',
                    state: 'queued',
                    currentStep: 'planning-scenes',
                    startedAt: undefined,
                    queuedAt: undefined,
                    updatedAt: undefined,
                  }),
                  episodeId: 'episode-no-time',
                  title: 'Episode Without Time',
                  queuedAt: undefined,
                  updatedAt: undefined,
                },
              ],
            } as never,
          }),
        ),
      ),
    );
    render(<PipelineQueuesBoard {...boardProps()} />);
    expect(await screen.findByText('Episode Without Time')).toBeVisible();
    expect(screen.queryByText(/elapsed/)).toBeNull();
    expect(screen.queryByText(/waiting/)).toBeNull();
  });

  it('closes the drawer when polling drops the selected item', async () => {
    const first = queues({
      api: { ...emptyLane, queued: [workItem()] },
    });
    const second = queues();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(first))
      .mockResolvedValue(response(second));
    vi.stubGlobal('fetch', fetchMock);
    (window as unknown as { fetch: typeof fetch }).fetch =
      fetchMock as unknown as typeof fetch;
    let poll: (() => void) | null = null;
    vi.spyOn(window, 'setInterval').mockImplementation((callback, ms) => {
      if (ms === 7000) {
        poll = callback as () => void;
      }
      return TIMER_HANDLE;
    });

    render(<PipelineQueuesBoard {...boardProps()} />);
    fireEvent.click(
      await screen.findByRole('button', { name: /Morning ingest/i }),
    );
    expect(
      screen.getByRole('complementary', { name: 'Episode queue details' }),
    ).toBeVisible();
    expect(poll).not.toBeNull();

    await act(async () => {
      poll?.();
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(
      screen.queryByRole('complementary', {
        name: 'Episode queue details',
      }),
    ).toBeNull();
  });
});
