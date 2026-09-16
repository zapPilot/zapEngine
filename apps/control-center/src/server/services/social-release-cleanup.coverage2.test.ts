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

function chain(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'in', 'limit', 'order']) {
    builder[method] = () => builder;
  }
  builder['then'] = (
    onFulfilled: (value: { data: unknown; error: unknown }) => unknown,
    onRejected?: (reason: unknown) => unknown,
  ) => Promise.resolve(result).then(onFulfilled, onRejected);
  return builder;
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

describe('social release cleanup null-payload branches', () => {
  it('treats a null jobs payload as an empty queue', async () => {
    const fake = {
      from: vi.fn(() => chain({ data: null, error: null })),
    };

    await expect(service(fake).getEvidence()).resolves.toMatchObject({
      posts: [],
      message: null,
    });
  });

  it('treats a null posts payload as no evidence', async () => {
    const fake = {
      from: vi.fn((table: string) => {
        if (table === 'social_publish_jobs') {
          return chain({ data: [{ episode_id: EPISODE_ID }], error: null });
        }
        return chain({ data: null, error: null });
      }),
    };

    await expect(service(fake).getEvidence()).resolves.toMatchObject({
      posts: [],
      message: null,
    });
  });
});
