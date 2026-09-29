// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
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

describe('PipelineQueuesBoard coverage2', () => {
  it('uses the singular abandoned copy for one hidden job', async () => {
    stubPoll(
      vi.fn().mockResolvedValue(
        response(
          queues({
            summary: {
              queueDepth: 0,
              processing: 0,
              blockedOrFailed: 0,
              publishedToday: 0,
              abandoned: 1,
            },
            render: {
              ...emptyLane,
              abandoned: [
                workItem({
                  key: 'render:abandoned-1',
                  kind: 'render',
                  state: 'failed',
                }),
              ],
            } as never,
          }),
        ),
      ),
    );
    render(<PipelineQueuesBoard {...boardProps()} />);
    expect(
      await screen.findByText(/1 abandoned job hidden from the render/),
    ).toBeVisible();
    // Singular has no trailing s.
    expect(screen.queryByText(/1 abandoned jobs hidden/)).toBeNull();
  });

  it('opens the drawer from an abandoned card', async () => {
    stubPoll(
      vi.fn().mockResolvedValue(
        response(
          queues({
            summary: {
              queueDepth: 0,
              processing: 0,
              blockedOrFailed: 0,
              publishedToday: 0,
              abandoned: 1,
            },
            render: {
              ...emptyLane,
              abandoned: [
                workItem({
                  key: 'render:abandoned-1',
                  kind: 'render',
                  title: 'Closed episode',
                  state: 'failed',
                }),
              ],
            } as never,
          }),
        ),
      ),
    );
    render(<PipelineQueuesBoard {...boardProps()} />);
    fireEvent.click(
      await screen.findByRole('button', { name: /Closed episode/i }),
    );
    expect(
      screen.getByRole('complementary', { name: 'Episode queue details' }),
    ).toBeVisible();
  });

  it('shows the queue error status message from the payload', async () => {
    stubPoll(
      vi
        .fn()
        .mockResolvedValue(
          response(queues({ status: 'error', message: 'Queue store is down' })),
        ),
    );
    render(<PipelineQueuesBoard {...boardProps()} />);
    expect(await screen.findByText(/Queue store is down/)).toBeVisible();
  });

  it('renders work cards with language badges and thumbnails', async () => {
    stubPoll(
      vi.fn().mockResolvedValue(
        response(
          queues({
            api: {
              ...emptyLane,
              queued: [
                workItem({
                  kind: 'ingest',
                  languageCode: 'en',
                  currentStep: 'Fetching',
                  thumbnailUrl: 'https://cdn.example.com/t.jpg',
                  progressPercent: 50,
                  workerId: 'worker-9',
                  startedAt: new Date(Date.now() - 30_000).toISOString(),
                  lastError: 'fetch failed',
                  retryCount: 1,
                }),
              ],
            },
          }),
        ),
      ),
    );
    render(<PipelineQueuesBoard {...boardProps()} />);
    expect(await screen.findByText('Morning ingest')).toBeVisible();
    expect(screen.getByText('en')).toBeVisible();
    expect(screen.getByText('50%')).toBeVisible();
  });

  it('aggregates an episode with a processing job carrying elapsed time', async () => {
    const startedAt = new Date(Date.now() - 120_000).toISOString();
    stubPoll(
      vi.fn().mockResolvedValue(
        response(
          queues({
            render: {
              ...emptyLane,
              processing: [
                {
                  ...workItem({
                    key: 'visual:ep1',
                    kind: 'visual',
                    state: 'processing',
                    currentStep: undefined,
                    startedAt,
                  }),
                  episodeId: EPISODE_ID,
                  title: 'Episode One',
                },
                {
                  ...workItem({
                    key: 'render:ep1-en',
                    kind: 'render',
                    languageCode: undefined,
                    state: 'processing',
                    currentStep: 'Rendering',
                    startedAt,
                  }),
                  episodeId: EPISODE_ID,
                  title: 'Episode One',
                },
              ],
            } as never,
          }),
        ),
      ),
    );
    render(<PipelineQueuesBoard {...boardProps()} />);
    expect(await screen.findByText('Episode One')).toBeVisible();
    // Visual without a step falls back to its label; render without a
    // language falls back to unknown.
    expect(screen.getByText('Visual planning')).toBeVisible();
    expect(screen.getByText('Render · unknown')).toBeVisible();
    expect(screen.getByText(/elapsed/)).toBeVisible();
  });

  it('shows waiting time for a queued aggregated episode', async () => {
    stubPoll(
      vi.fn().mockResolvedValue(
        response(
          queues({
            render: {
              ...emptyLane,
              queued: [
                {
                  ...workItem({
                    key: 'visual:ep2',
                    kind: 'visual',
                    state: 'queued',
                    currentStep: 'planning-scenes',
                    startedAt: undefined,
                    queuedAt: new Date(Date.now() - 60_000).toISOString(),
                  }),
                  episodeId: 'episode-2',
                  title: 'Episode Two',
                },
              ],
            } as never,
          }),
        ),
      ),
    );
    render(<PipelineQueuesBoard {...boardProps()} />);
    expect(await screen.findByText('Episode Two')).toBeVisible();
    expect(screen.getByText(/waiting/)).toBeVisible();
  });

  it('keeps the drawer closed for an unknown selection key', async () => {
    stubPoll(
      vi.fn().mockResolvedValue(
        response(
          queues({
            api: { ...emptyLane, queued: [workItem()] },
          }),
        ),
      ),
    );
    render(<PipelineQueuesBoard {...boardProps()} />);
    await screen.findByText('Morning ingest');
    expect(
      screen.queryByRole('complementary', {
        name: 'Episode queue details',
      }),
    ).toBeNull();
  });

  it('names an abandon refusal when the error body cannot be parsed', async () => {
    const payload = queues({
      render: {
        ...emptyLane,
        attention: [
          workItem({
            key: 'render:ja',
            kind: 'render',
            languageCode: 'ja',
            currentStep: 'Rendering',
            retryCount: 1,
          }),
        ],
      },
    });
    const fetchMock = vi.fn(async (url: string) => {
      if (typeof url === 'string' && url.includes('/abandon')) {
        return {
          ok: false,
          status: 500,
          json: () => Promise.reject(new Error('not json')),
        } as unknown as Response;
      }
      return response(payload);
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    stubPoll(fetchMock);
    render(<PipelineQueuesBoard {...boardProps()} />);
    fireEvent.click(
      await screen.findByRole('button', { name: /Morning ingest/i }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Abandon episode' }));
    expect(await screen.findByText('HTTP 500')).toBeVisible();
  });

  it('renders a drawer without an episode row when the card has none', async () => {
    stubPoll(
      vi.fn().mockResolvedValue(
        response(
          queues({
            api: {
              ...emptyLane,
              queued: [
                workItem({ episodeId: undefined, title: 'Orphan ingest' }),
              ],
            },
          }),
        ),
      ),
    );
    render(<PipelineQueuesBoard {...boardProps()} />);
    fireEvent.click(
      await screen.findByRole('button', { name: /Orphan ingest/i }),
    );
    const drawer = screen.getByRole('complementary', {
      name: 'Episode queue details',
    });
    expect(within(drawer).getByText('no episode row')).toBeVisible();
  });
});
