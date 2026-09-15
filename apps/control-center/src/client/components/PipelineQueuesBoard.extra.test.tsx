// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import {
  act,
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
  PipelineQueuesResponse,
} from '../../shared/pipeline-queues.js';
import {
  itemMatches,
  PipelineQueuesBoard,
} from './PipelineQueuesBoard.js';

const EPISODE_ID = '11111111-1111-4111-8111-111111111111';
const LOCALIZATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
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

describe('PipelineQueuesBoard loading', () => {
  it('says the runtime queues are loading', () => {
    stubPoll(vi.fn().mockImplementation(() => new Promise(() => undefined)));

    render(<PipelineQueuesBoard {...boardProps()} />);

    expect(screen.getByText('Loading runtime queues…')).toBeVisible();
  });

  it('names a queue read failure', async () => {
    stubPoll(vi.fn().mockRejectedValue(new Error('connection refused')));

    render(<PipelineQueuesBoard {...boardProps()} />);

    expect(
      await screen.findByText('Pipeline queues unavailable: connection refused'),
    ).toBeVisible();
  });

  it('reports an unreadable failure as a plain refresh failure', async () => {
    stubPoll(vi.fn().mockRejectedValue('string-boom'));

    render(<PipelineQueuesBoard {...boardProps()} />);

    expect(
      await screen.findByText('Pipeline queues unavailable: Queue refresh failed'),
    ).toBeVisible();
  });

  it('renders the unconfigured message instead of empty lanes', async () => {
    stubPoll(
      vi
        .fn()
        .mockResolvedValue(
          response(queues({ status: 'unconfigured', message: 'Supabase is not configured' })),
        ),
    );

    render(<PipelineQueuesBoard {...boardProps()} />);

    expect(
      await screen.findByText('Supabase is not configured'),
    ).toBeVisible();
    expect(screen.getByText('API queue')).toBeVisible();
  });

  it('keeps an inline refresh error beside live lanes', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(queues()))
      .mockRejectedValueOnce(new Error('refresh blew up'));
    let poll: (() => void) | null = null;
    vi.stubGlobal('fetch', fetchMock);
    (window as unknown as { fetch: typeof fetch }).fetch =
      fetchMock as unknown as typeof fetch;
    vi.spyOn(window, 'setInterval').mockImplementation((callback, ms) => {
      if (ms === 7000) {
        poll = callback as () => void;
      }
      return TIMER_HANDLE;
    });

    render(<PipelineQueuesBoard {...boardProps()} />);
    await screen.findByText('API queue');
    expect(poll).not.toBeNull();

    await act(async () => {
      poll?.();
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(await screen.findByText('Last refresh: refresh blew up')).toBeVisible();
    expect(screen.getByText('API queue')).toBeVisible();
  });
});

describe('PipelineQueuesBoard search', () => {
  it('filters every lane by title or episode UUID', async () => {
    stubPoll(
      vi.fn().mockResolvedValue(
        response(
          queues({
            api: {
              ...emptyLane,
              queued: [
                workItem({ title: 'Morning ingest' }),
                workItem({
                  key: 'api:other',
                  episodeId: 'other-episode',
                  title: 'Evening ingest',
                }),
              ],
            },
          }),
        ),
      ),
    );

    render(<PipelineQueuesBoard {...boardProps()} />);
    await screen.findByText('Morning ingest');

    const search = screen.getByRole('searchbox', { name: 'Search pipeline queues' });
    fireEvent.change(search, { target: { value: 'morning' } });

    expect(screen.getByText('Morning ingest')).toBeVisible();
    expect(screen.queryByText('Evening ingest')).toBeNull();

    fireEvent.change(search, { target: { value: 'other-episode' } });
    expect(screen.getByText('Evening ingest')).toBeVisible();
    expect(screen.queryByText('Morning ingest')).toBeNull();
  });
});

describe('PipelineQueuesBoard queue operations', () => {
  function singleRenderBoard(
    fetchMock: ReturnType<typeof vi.fn>,
    props: ReturnType<typeof boardProps>,
  ) {
    stubPoll(fetchMock);
    render(<PipelineQueuesBoard {...props} />);
  }

  it('refetches right after a restart so the moved card is visible', async () => {
    const payload = queues({ api: { ...emptyLane, attention: [workItem()] } });
    const fetchMock = vi.fn().mockResolvedValue(response(payload));
    const props = boardProps();
    singleRenderBoard(fetchMock, props);

    fireEvent.click(await screen.findByRole('button', { name: /Morning ingest/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Restart ingest' }));

    await waitFor(() =>
      expect(props.onRestartStep).toHaveBeenCalledWith(EPISODE_ID, {
        step: 'ingest',
      }),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it('abandons a failed episode and refetches', async () => {
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
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (typeof url === 'string' && url.includes('/abandon')) {
        return new Response('{}', {
          headers: { 'content-type': 'application/json' },
        });
      }
      return response(payload);
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const props = boardProps();
    singleRenderBoard(fetchMock, props);

    fireEvent.click(await screen.findByRole('button', { name: /Morning ingest/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Abandon episode' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it('names an abandon refusal from the API', async () => {
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
        return new Response(JSON.stringify({ error: 'already processing' }), {
          status: 409,
          headers: { 'content-type': 'application/json' },
        });
      }
      return response(payload);
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    singleRenderBoard(fetchMock, boardProps());

    fireEvent.click(await screen.findByRole('button', { name: /Morning ingest/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Abandon episode' }));

    expect(await screen.findByText('already processing')).toBeVisible();
  });

  it('falls back to the status when an abandon refusal names nothing', async () => {
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
        return new Response(JSON.stringify({}), {
          status: 500,
          headers: { 'content-type': 'application/json' },
        });
      }
      return response(payload);
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    singleRenderBoard(fetchMock, boardProps());

    fireEvent.click(await screen.findByRole('button', { name: /Morning ingest/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Abandon episode' }));

    expect(await screen.findByText('HTTP 500')).toBeVisible();
  });
});

describe('PipelineQueuesBoard cards', () => {
  it('renders work cards with thumbnails, progress, errors and timing', async () => {
    stubPoll(
      vi.fn().mockResolvedValue(
        response(
          queues({
            api: {
              processing: [
                workItem({
                  kind: 'ingest',
                  currentStep: undefined,
                  thumbnailUrl: 'https://cdn.example.com/t.jpg',
                  workerId: 'worker-1',
                  startedAt: new Date(Date.now() - 90_000).toISOString(),
                  progressPercent: 150,
                  lastError: 'fetch failed',
                  retryCount: 3,
                }),
              ],
              queued: [
                workItem({
                  key: 'api:visual',
                  kind: 'visual',
                  episodeId: undefined,
                  currentStep: undefined,
                  queuedAt: new Date(Date.now() - 5_000).toISOString(),
                  progressPercent: -5,
                  lastError: undefined,
                  retryCount: 0,
                  actions: {},
                }),
                workItem({
                  key: 'api:render',
                  kind: 'render',
                  languageCode: undefined,
                  currentStep: undefined,
                  queuedAt: '2020-01-01T00:00:00.000Z',
                  lastError: undefined,
                  retryCount: 0,
                  actions: {},
                }),
              ],
              attention: [],
            },
          }),
        ),
      ),
    );

    render(<PipelineQueuesBoard {...boardProps()} />);

    expect(await screen.findByText('Ingest')).toBeVisible();
    expect(screen.getByText('Visual planning')).toBeVisible();
    expect(screen.getByText('Rendering')).toBeVisible();
    // Progress clamps to the 0–100 range it can actually draw.
    expect(screen.getByText('100%')).toBeVisible();
    expect(screen.getByText('0%')).toBeVisible();
    expect(screen.getByText('fetch failed')).toBeVisible();
    expect(screen.getByText('worker · worker-1')).toBeVisible();
    expect(screen.getByText(/elapsed/)).toBeVisible();
    expect(screen.getByText(/waiting/)).toBeVisible();
    expect(screen.getByText('retry 3')).toBeVisible();
    expect(screen.getByText('no episode row')).toBeVisible();
  });

  it('opens the drawer for api work', async () => {
    stubPoll(
      vi.fn().mockResolvedValue(
        response(queues({ api: { ...emptyLane, attention: [workItem()] } })),
      ),
    );

    render(<PipelineQueuesBoard {...boardProps()} />);
    fireEvent.click(await screen.findByRole('button', { name: /Morning ingest/i }));

    const drawer = screen.getByRole('complementary', {
      name: 'Episode queue details',
    });
    expect(within(drawer).getByText('API QUEUE')).toBeVisible();
  });

  it('shows an empty lane as none rather than nothing', async () => {
    stubPoll(vi.fn().mockResolvedValue(response(queues())));

    render(<PipelineQueuesBoard {...boardProps()} />);

    expect(await screen.findAllByText('None')).toHaveLength(6);
  });
});

describe('itemMatches edges', () => {
  it('matches everything on an empty query', () => {
    expect(itemMatches('Morning ingest', EPISODE_ID, '   ')).toBe(true);
  });

  it('matches nothing without an episode id when the title misses', () => {
    expect(itemMatches('Morning ingest', undefined, 'zzz')).toBe(false);
  });

  it('matches titles case-insensitively', () => {
    expect(itemMatches('Morning ingest', undefined, 'MORNING')).toBe(true);
  });
});
