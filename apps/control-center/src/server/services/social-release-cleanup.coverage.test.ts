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

function chain(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'in', 'limit', 'order']) {
    builder[method] = () => builder;
  }
  builder['then'] = (
    onFulfilled: (value: unknown) => unknown,
    onRejected?: (reason: unknown) => unknown,
  ) => Promise.resolve(result).then(onFulfilled, onRejected);
  return builder;
}

function client(
  tables: Record<string, { data: unknown; error: unknown }>,
  rpc: ReturnType<typeof vi.fn> = vi.fn(),
) {
  return {
    from: vi.fn((table: string) => {
      const result = tables[table];
      if (!result) {
        throw new Error(`unexpected read of ${table}`);
      }
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

function unconfiguredService() {
  fakeClient.current = null;
  return createSocialReleaseCleanupService({
    config: readControlCenterConfig({}),
    now: () => new Date('2026-09-05T04:00:00.000Z'),
  });
}

describe('social release cleanup coverage', () => {
  it('degrades to unconfigured when Supabase is absent', async () => {
    await expect(unconfiguredService().getEvidence()).resolves.toEqual({
      generatedAt: '2026-09-05T04:00:00.000Z',
      posts: [],
      message: 'Supabase social release evidence is not connected',
    });
  });

  it('throws when the jobs read fails', async () => {
    const fake = client({
      social_publish_jobs: { data: null, error: { message: 'jobs boom' } },
    });
    await expect(service(fake).getEvidence()).rejects.toMatchObject({
      message: 'jobs boom',
    });
  });

  it('throws when the posts read fails', async () => {
    const fake = client({
      social_publish_jobs: { data: [{ episode_id: 'ep-1' }], error: null },
      social_posts: { data: null, error: { message: 'posts boom' } },
    });
    await expect(service(fake).getEvidence()).rejects.toMatchObject({
      message: 'posts boom',
    });
  });

  it('drops malformed post rows and normalizes missing optionals to null', async () => {
    const fake = client({
      social_publish_jobs: { data: [{ episode_id: 'ep-1' }], error: null },
      social_posts: {
        data: [
          {
            episode_id: 'ep-1',
            platform: 'x',
            language_code: 42,
            post_url: 7,
            published_at: '2026-09-05T03:00:00.000Z',
          },
          {
            episode_id: null,
            platform: 'x',
            published_at: '2026-09-05T03:00:00.000Z',
          },
          { episode_id: 'ep-1', platform: 'x', published_at: null },
        ],
        error: null,
      },
    });
    await expect(service(fake).getEvidence()).resolves.toMatchObject({
      posts: [
        {
          episodeId: 'ep-1',
          platform: 'x',
          languageCode: null,
          postUrl: null,
        },
      ],
    });
  });

  it('dedupes job episode ids and skips non-string episode ids', async () => {
    const fake = client({
      social_publish_jobs: {
        data: [
          { episode_id: 'ep-1' },
          { episode_id: 'ep-1' },
          { episode_id: 7 },
        ],
        error: null,
      },
      social_posts: { data: [], error: null },
    });
    const svc = service(fake);
    await expect(svc.getEvidence()).resolves.toMatchObject({ posts: [] });
    expect(fake.from).toHaveBeenCalledTimes(2);
  });

  it('refuses closeRelease without Supabase', async () => {
    await expect(unconfiguredService().closeRelease('ep-1')).rejects.toThrow(
      'Supabase social release cleanup is not connected',
    );
  });

  it('reports skipped 0 when the RPC returns a non-number', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 'ok', error: null });
    await expect(
      service(client({}, rpc)).closeRelease('ep-1'),
    ).resolves.toEqual({
      skipped: 0,
    });
  });

  it('throws when close RPC fails', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: null, error: { message: 'rpc boom' } });
    await expect(
      service(client({}, rpc)).closeRelease('ep-1'),
    ).rejects.toMatchObject({
      message: 'rpc boom',
    });
  });

  it('defaults now to the current time when omitted', async () => {
    fakeClient.current = null;
    const svc = createSocialReleaseCleanupService({
      config: readControlCenterConfig({}),
    });
    const evidence = await svc.getEvidence();
    expect(evidence.posts).toEqual([]);
    expect(Date.parse(evidence.generatedAt)).not.toBeNaN();
  });
});
