// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {
  act,
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
import { itemMatches, PipelineQueuesBoard } from './PipelineQueuesBoard.js';

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
        workItem({
          key: `visual:${EPISODE_ID}`,
          kind: 'visual',
          languageCode: undefined,
          state: 'queued',
          currentStep: 'Visual planning',
          retryCount: 0,
          lastError: undefined,
          actions: { disabledReason: 'Waiting for a worker; nothing to retry yet.' },
        }),
        workItem({
          key: 'render:zh-hant',
          languageCode: 'zh-Hant',
          state: 'queued',
          retryCount: 0,
          lastError: undefined,
          actions: { disabledReason: 'Waiting for a worker; nothing to retry yet.' },
        }),
        workItem({
          key: 'render:en',
          languageCode: 'en',
          state: 'queued',
          retryCount: 0,
          lastError: undefined,
          actions: { disabledReason: 'Waiting for a worker; nothing to retry yet.' },
        }),
      ],
      attention: [workItem({ key: 'render:ja' })],
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
        workItem({
          key: 'render:abandoned-1',
          abandoned: {
            at: '2026-09-04T00:00:00.000Z',
            reason: 'Legacy zh-Hant-only render',
          },
          actions: {
            disabledReason: 'Closed by an operator: Legacy zh-Hant-only render',
          },
        }),
        workItem({
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
      attention: [workItem()],
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
