// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  PipelineQueueItem,
  PipelineQueuesResponse,
} from '../../shared/pipeline-queues.js';
import { PipelineQueuesBoard } from './PipelineQueuesBoard.js';
import { itemMatches } from './pipeline-queue-filter.js';

const EPISODE_ID = '11111111-1111-4111-8111-111111111111';
const SECOND_EPISODE_ID = '22222222-2222-4222-8222-222222222222';
const LOCALIZATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const POST_URL = 'https://x.com/zap/status/123';
const TIMER_HANDLE = 1 as unknown as ReturnType<typeof window.setInterval>;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function queueResponse(
  status: 'queued' | 'publishing' = 'queued',
): PipelineQueuesResponse {
  const publishing = status === 'publishing';
  return {
    generatedAt: '2026-09-05T06:00:00.000Z',
    status: 'ok',
    message: null,
    summary: {
      queueDepth: publishing ? 0 : 1,
      processing: publishing ? 1 : 0,
      blockedOrFailed: 0,
      publishedToday: 1,
      abandoned: 0,
    },
    api: { processing: [], queued: [], attention: [] },
    render: { processing: [], queued: [], attention: [] },
    social: {
      processing: publishing
        ? [
            {
              key: `social:${EPISODE_ID}`,
              episodeId: EPISODE_ID,
              title: 'Why We Build',
              contentType: 'video',
              scheduledAt: '2026-09-05T05:30:00.000Z',
              state: 'publishing',
              platforms: [
                {
                  platform: 'x',
                  languageCode: 'en',
                  status: 'published',
                  scheduledAt: '2026-09-05T05:30:00.000Z',
                  publishedAt: '2026-09-05T05:35:00.000Z',
                  url: POST_URL,
                  retryCount: 0,
                },
                {
                  platform: 'rednote',
                  languageCode: 'zh-Hant',
                  status: 'publishing',
                  scheduledAt: '2026-09-05T05:30:00.000Z',
                  workerId: 'social-worker-01',
                  retryCount: 1,
                },
                {
                  platform: 'youtube',
                  languageCode: 'en',
                  status: 'failed',
                  scheduledAt: '2026-09-05T05:30:00.000Z',
                  error: 'upload rejected',
                  retryCount: 1,
                },
              ],
              history: [
                {
                  at: '2026-09-05T05:00:00.000Z',
                  label: 'x added to social queue',
                },
                {
                  at: '2026-09-05T05:35:00.000Z',
                  label: 'x published',
                  detail: POST_URL,
                },
              ],
              publishedLinks: [
                {
                  platform: 'x',
                  languageCode: 'en',
                  publishedAt: '2026-09-05T05:35:00.000Z',
                  url: POST_URL,
                },
              ],
            },
          ]
        : [],
      queued: publishing
        ? []
        : [
            {
              key: `social:${EPISODE_ID}`,
              episodeId: EPISODE_ID,
              title: 'Why We Build',
              contentType: 'video',
              scheduledAt: '2026-09-05T05:30:00.000Z',
              state: 'partial',
              platforms: [
                {
                  platform: 'x',
                  languageCode: 'en',
                  status: 'published',
                  scheduledAt: '2026-09-05T05:30:00.000Z',
                  publishedAt: '2026-09-05T05:35:00.000Z',
                  url: POST_URL,
                  retryCount: 0,
                },
                {
                  platform: 'rednote',
                  languageCode: 'zh-Hant',
                  status: 'queued',
                  scheduledAt: '2026-09-05T05:30:00.000Z',
                  retryCount: 0,
                },
                {
                  platform: 'youtube',
                  languageCode: 'en',
                  status: 'failed',
                  scheduledAt: '2026-09-05T05:30:00.000Z',
                  error: 'upload rejected',
                  retryCount: 1,
                },
              ],
              history: [
                {
                  at: '2026-09-05T05:00:00.000Z',
                  label: 'x added to social queue',
                },
                {
                  at: '2026-09-05T05:35:00.000Z',
                  label: 'x published',
                  detail: POST_URL,
                },
              ],
              publishedLinks: [
                {
                  platform: 'x',
                  languageCode: 'en',
                  publishedAt: '2026-09-05T05:35:00.000Z',
                  url: POST_URL,
                },
              ],
            },
          ],
      attention: [],
    },
  };
}

// A real Response rather than a cast: the board's fetch helper reads
// `content-type` to reject a non-JSON body, which a hand-rolled stub without
// headers cannot exercise.
function response(payload: PipelineQueuesResponse): Response {
  return new Response(JSON.stringify(payload), {
    headers: { 'content-type': 'application/json' },
  });
}

function renderWorkItem(
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
    history: [],
    publishedLinks: [],
    actions: { restart: { step: 'render', localizationId: LOCALIZATION_ID } },
    ...overrides,
  };
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

describe('PipelineQueuesBoard', () => {
  it('matches title, full UUID, and partial UUID searches', () => {
    expect(itemMatches('Why We Build', EPISODE_ID, 'we build')).toBe(true);
    expect(itemMatches('Why We Build', EPISODE_ID, EPISODE_ID)).toBe(true);
    expect(itemMatches('Why We Build', EPISODE_ID, '1111-4111')).toBe(true);
    expect(itemMatches('Why We Build', EPISODE_ID, 'other episode')).toBe(
      false,
    );
  });

  it('aggregates visual and localized render jobs into one episode card', async () => {
    const payload = queueResponse();
    payload.social = { processing: [], queued: [], attention: [] };
    payload.render = {
      processing: [],
      queued: [
        renderWorkItem({
          key: `visual:${EPISODE_ID}`,
          kind: 'visual',
          languageCode: undefined,
          state: 'queued',
          currentStep: 'Visual planning',
          retryCount: 0,
          lastError: undefined,
          actions: {
            disabledReason: 'Waiting for a worker; nothing to retry yet.',
          },
        }),
        renderWorkItem({
          key: 'render:zh-hant',
          languageCode: 'zh-Hant',
          state: 'queued',
          retryCount: 0,
          lastError: undefined,
          actions: {
            disabledReason: 'Waiting for a worker; nothing to retry yet.',
          },
        }),
        renderWorkItem({
          key: 'render:en',
          languageCode: 'en',
          state: 'queued',
          retryCount: 0,
          lastError: undefined,
          actions: {
            disabledReason: 'Waiting for a worker; nothing to retry yet.',
          },
        }),
      ],
      attention: [renderWorkItem({ key: 'render:ja' })],
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(payload)));
    vi.spyOn(window, 'setInterval').mockImplementation(() => TIMER_HANDLE);

    render(<PipelineQueuesBoard {...boardProps()} />);

    const renderHeading = await screen.findByRole('heading', {
      name: 'Render queue',
    });
    const renderColumn = renderHeading.closest('section');
    expect(renderColumn).not.toBeNull();
    const cards = within(renderColumn!).getAllByRole('button', {
      name: /Why We Build/i,
    });
    expect(cards).toHaveLength(1);
    const card = cards[0]!;
    expect(within(card).getByText('Visual planning')).toBeInTheDocument();
    expect(within(card).getByText('Render · zh-Hant')).toBeInTheDocument();
    expect(within(card).getByText('Render · ja')).toBeInTheDocument();
    expect(within(card).getByText('Render · en')).toBeInTheDocument();
    expect(within(renderColumn!).getByText('ATTENTION')).toBeInTheDocument();

    fireEvent.click(card);
    const drawer = screen.getByRole('complementary', {
      name: 'Episode queue details',
    });
    expect(within(drawer).getByText('Visual planning')).toBeInTheDocument();
    expect(within(drawer).getByText('Render · zh-Hant')).toBeInTheDocument();
    expect(within(drawer).getByText('Render · ja')).toBeInTheDocument();
    expect(within(drawer).getByText('Render · en')).toBeInTheDocument();
    expect(
      within(drawer).getByRole('button', { name: 'Retry ja render' }),
    ).toBeInTheDocument();
  });

  it('opens the selected episode drawer with stored links and lane errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(response(queueResponse())),
    );
    vi.spyOn(window, 'setInterval').mockImplementation(() => TIMER_HANDLE);

    render(<PipelineQueuesBoard {...boardProps()} />);

    const card = await screen.findByRole('button', { name: /Why We Build/i });
    fireEvent.click(card);

    const drawer = screen.getByRole('complementary', {
      name: 'Episode queue details',
    });
    expect(within(drawer).getByText(EPISODE_ID)).toBeInTheDocument();
    expect(within(drawer).getByText('upload rejected')).toBeInTheDocument();
    const link = within(drawer).getByRole('link', {
      name: new RegExp(POST_URL),
    });
    expect(link).toHaveAttribute('href', POST_URL);
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('keeps the selected drawer open while polling updates the item in place', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(queueResponse()))
      .mockResolvedValueOnce(response(queueResponse('publishing')));
    vi.stubGlobal('fetch', fetchMock);
    if (typeof window !== 'undefined') {
      (window as unknown as { fetch: typeof fetch }).fetch =
        fetchMock as unknown as typeof fetch;
    }

    let poll: (() => void) | null = null;
    vi.spyOn(window, 'setInterval').mockImplementation((callback, ms) => {
      if (ms === 7000) {
        poll = callback as () => void;
      }
      return TIMER_HANDLE;
    });

    render(<PipelineQueuesBoard {...boardProps()} />);
    const button = await screen.findByRole('button', { name: /Why We Build/i });
    expect(poll).not.toBeNull();
    fireEvent.click(button);
    expect(
      screen.getByRole('complementary', { name: 'Episode queue details' }),
    ).toBeInTheDocument();

    await act(async () => {
      poll?.();
      await new Promise((r) => setTimeout(r, 50));
    });

    const drawer = screen.getByRole('complementary', {
      name: 'Episode queue details',
    });
    // Polling should keep the drawer open and preserve the episode context
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(within(drawer).getByText(EPISODE_ID)).toBeInTheDocument();
    expect(drawer).toBeInTheDocument();
  });

  it('keeps abandoned render jobs out of the lanes and behind a disclosure', async () => {
    const payload = queueResponse();
    payload.summary.abandoned = 2;
    payload.render = {
      processing: [],
      queued: [],
      attention: [],
      abandoned: [
        renderWorkItem({
          key: 'render:abandoned-1',
          abandoned: {
            at: '2026-09-04T00:00:00.000Z',
            reason: 'Legacy zh-Hant-only render',
          },
          actions: {
            disabledReason: 'Closed by an operator: Legacy zh-Hant-only render',
          },
        }),
        renderWorkItem({
          key: 'render:abandoned-2',
          episodeId: SECOND_EPISODE_ID,
          title: 'Another closed episode',
        }),
      ],
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(payload)));
    vi.spyOn(window, 'setInterval').mockImplementation(() => TIMER_HANDLE);

    render(<PipelineQueuesBoard {...boardProps()} />);

    expect(
      await screen.findByText(/2 abandoned jobs hidden/i),
    ).toBeInTheDocument();
    expect(screen.queryByText('ATTENTION')).not.toBeInTheDocument();
    const disclosure = screen.getByText('Abandoned (2)');
    expect(disclosure).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Another closed episode/i }),
    ).toBeInTheDocument();
  });

  it('shows a compact error on a failed card so identical failures read at a glance', async () => {
    const payload = queueResponse();
    payload.render = {
      processing: [],
      queued: [],
      attention: [renderWorkItem()],
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(payload)));
    vi.spyOn(window, 'setInterval').mockImplementation(() => TIMER_HANDLE);

    render(<PipelineQueuesBoard {...boardProps()} />);

    expect(
      await screen.findByText(/Raster resvg stage failed/),
    ).toBeInTheDocument();
  });

  it('does not mention abandoned work when there is none', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(response(queueResponse())),
    );
    vi.spyOn(window, 'setInterval').mockImplementation(() => TIMER_HANDLE);

    render(<PipelineQueuesBoard {...boardProps()} />);

    await screen.findByRole('button', { name: /Why We Build/i });
    expect(screen.queryByText(/abandoned/i)).not.toBeInTheDocument();
  });
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
      await screen.findByText(
        'Pipeline queues unavailable: connection refused',
      ),
    ).toBeVisible();
  });

  it('reports an unreadable failure as a plain refresh failure', async () => {
    stubPoll(vi.fn().mockRejectedValue('string-boom'));

    render(<PipelineQueuesBoard {...boardProps()} />);

    expect(
      await screen.findByText(
        'Pipeline queues unavailable: Queue refresh failed',
      ),
    ).toBeVisible();
  });

  it('renders the unconfigured message instead of empty lanes', async () => {
    stubPoll(
      vi.fn().mockResolvedValue(
        response(
          queues({
            status: 'unconfigured',
            message: 'Supabase is not configured',
          }),
        ),
      ),
    );

    render(<PipelineQueuesBoard {...boardProps()} />);

    expect(await screen.findByText('Supabase is not configured')).toBeVisible();
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
      await Promise.resolve();
    });

    expect(
      await screen.findByText('Last refresh: refresh blew up'),
    ).toBeVisible();
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

    const search = screen.getByRole('searchbox', {
      name: 'Search pipeline queues',
    });
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

    fireEvent.click(
      await screen.findByRole('button', { name: /Morning ingest/i }),
    );
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
    const fetchMock = vi.fn(async (url: string) => {
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

    fireEvent.click(
      await screen.findByRole('button', { name: /Morning ingest/i }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Abandon episode' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `/api/podcast-pipeline/${EPISODE_ID}/abandon`,
      { method: 'POST' },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/pipeline/queues');
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

    fireEvent.click(
      await screen.findByRole('button', { name: /Morning ingest/i }),
    );
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

    fireEvent.click(
      await screen.findByRole('button', { name: /Morning ingest/i }),
    );
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
    expect(screen.getAllByText(/waiting/)).toHaveLength(2);
    expect(screen.getByText('retry 3')).toBeVisible();
    expect(screen.getByText('no episode row')).toBeVisible();
  });

  it('opens the drawer for api work', async () => {
    stubPoll(
      vi
        .fn()
        .mockResolvedValue(
          response(queues({ api: { ...emptyLane, attention: [workItem()] } })),
        ),
    );

    render(<PipelineQueuesBoard {...boardProps()} />);
    fireEvent.click(
      await screen.findByRole('button', { name: /Morning ingest/i }),
    );

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

describe('abandoned work and unavailable detail', () => {
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

describe('selection lifecycle and polling', () => {
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
