import { describe, expect, it, vi } from 'vitest';

import { readControlCenterConfig } from '../config/env.js';
import { createSocialReleaseCleanupService } from './social-release-cleanup.js';

const fakeClient = vi.hoisted(() => ({ current: null as unknown }));

vi.mock('./supabase.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./supabase.js')>();
  return {
    ...actual,
    createConfiguredServiceRoleClient: () => fakeClient.current,
  };
});

const EPISODE_ID = '826f4b87-6278-4275-bff5-535ba5ef438d';

type QueryResult = { data: unknown; error: unknown };

function chain(result: QueryResult) {
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'in', 'limit', 'order']) {
    builder[method] = () => builder;
  }
  builder['then'] = (
    onFulfilled: (value: QueryResult) => unknown,
    onRejected?: (reason: unknown) => unknown,
  ) => Promise.resolve(result).then(onFulfilled, onRejected);
  return builder;
}

function client(
  tables: Record<string, QueryResult>,
  rpc: ReturnType<typeof vi.fn> = vi.fn(),
) {
  return {
    from: vi.fn((table: string) => {
      const result = tables[table];
      if (!result) throw new Error(`unexpected read of ${table}`);
      return chain(result);
    }),
    rpc,
  };
}

function service(fake: unknown) {
  fakeClient.current = fake;
  return createSocialReleaseCleanupService({
    config: readControlCenterConfig({
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role',
    }),
    now: () => new Date('2026-09-05T04:00:00.000Z'),
  });
}

describe('social release cleanup service', () => {
  it('returns real post URLs for episodes that still have active lanes', async () => {
    const fake = client({
      social_publish_jobs: {
        data: [{ episode_id: EPISODE_ID }, { episode_id: EPISODE_ID }],
        error: null,
      },
      social_posts: {
        data: [
          {
            episode_id: EPISODE_ID,
            platform: 'threads',
            language_code: 'ja',
            post_url: 'https://www.threads.net/@zap/post/123',
            published_at: '2026-09-05T03:30:00.000Z',
          },
        ],
        error: null,
      },
    });

    await expect(service(fake).getEvidence()).resolves.toEqual({
      generatedAt: '2026-09-05T04:00:00.000Z',
      posts: [
        {
          episodeId: EPISODE_ID,
          platform: 'threads',
          languageCode: 'ja',
          postUrl: 'https://www.threads.net/@zap/post/123',
          publishedAt: '2026-09-05T03:30:00.000Z',
        },
      ],
      message: null,
    });
  });

  it('does not read social_posts when the pending queue is empty', async () => {
    const fake = client({
      social_publish_jobs: { data: [], error: null },
    });

    await expect(service(fake).getEvidence()).resolves.toMatchObject({
      posts: [],
      message: null,
    });
    expect(fake.from).toHaveBeenCalledTimes(1);
  });

  it('closes a release through the bounded RPC and reports skipped lanes', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 2, error: null });
    const fake = client({}, rpc);

    await expect(service(fake).closeRelease(EPISODE_ID)).resolves.toEqual({
      skipped: 2,
    });
    expect(rpc).toHaveBeenCalledWith('close_social_release', {
      p_episode_id: EPISODE_ID,
    });
  });
});
