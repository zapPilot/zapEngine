import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PipelineQueuesResponse } from '../../shared/pipeline-queues.js';
import { itemMatches, PipelineQueuesBoard } from './PipelineQueuesBoard.js';

const EPISODE_ID = '11111111-1111-4111-8111-111111111111';
const POST_URL = 'https://x.com/zap/status/123';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function queueResponse(status: 'queued' | 'publishing' = 'queued'): PipelineQueuesResponse {
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

function response(payload: PipelineQueuesResponse): Response {
  return {
    ok: true,
    json: async () => payload,
  } as Response;
}

describe('PipelineQueuesBoard', () => {
  it('matches title, full UUID, and partial UUID searches', () => {
    expect(itemMatches('Why We Build', EPISODE_ID, 'we build')).toBe(true);
    expect(itemMatches('Why We Build', EPISODE_ID, EPISODE_ID)).toBe(true);
    expect(itemMatches('Why We Build', EPISODE_ID, '1111-4111')).toBe(true);
    expect(itemMatches('Why We Build', EPISODE_ID, 'other episode')).toBe(false);
  });

  it('opens the selected episode drawer with stored links and lane errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(queueResponse())));
    vi.spyOn(window, 'setInterval').mockImplementation(() => 1);

    render(<PipelineQueuesBoard />);

    const card = await screen.findByRole('button', { name: /Why We Build/i });
    fireEvent.click(card);

    const drawer = screen.getByRole('complementary', {
      name: 'Episode queue details',
    });
    expect(within(drawer).getByText(EPISODE_ID)).toBeInTheDocument();
    expect(within(drawer).getByText('upload rejected')).toBeInTheDocument();
    const link = within(drawer).getByRole('link', { name: new RegExp(POST_URL) });
    expect(link).toHaveAttribute('href', POST_URL);
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('keeps the selected drawer open while polling updates the item in place', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(queueResponse()))
      .mockResolvedValueOnce(response(queueResponse('publishing')));
    vi.stubGlobal('fetch', fetchMock);

    let poll: (() => void) | null = null;
    vi.spyOn(window, 'setInterval').mockImplementation((callback) => {
      poll = callback as () => void;
      return 1;
    });

    render(<PipelineQueuesBoard />);
    fireEvent.click(
      await screen.findByRole('button', { name: /Why We Build/i }),
    );
    expect(
      screen.getByRole('complementary', { name: 'Episode queue details' }),
    ).toBeInTheDocument();

    await act(async () => {
      poll?.();
      await Promise.resolve();
      await Promise.resolve();
    });

    const drawer = screen.getByRole('complementary', {
      name: 'Episode queue details',
    });
    expect(within(drawer).getByText('social-worker-01')).toBeInTheDocument();
    expect(within(drawer).getByText(EPISODE_ID)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
