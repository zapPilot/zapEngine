import { describe, expect, it, vi } from 'vitest';

import { readControlCenterConfig } from '../../config/env.js';

const fromMock = vi.hoisted(() => vi.fn());

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: fromMock,
  })),
}));

const { readRecentSocialPosts } = await import('./growth-lanes.js');

describe('growth lanes default client', () => {
  it('uses createClient when no factory is injected', async () => {
    fromMock.mockReturnValue({
      select: () => ({
        gte: () => ({
          order: () => ({
            limit: () => Promise.resolve({ data: [], error: null }),
          }),
        }),
      }),
    });

    const result = await readRecentSocialPosts({
      config: readControlCenterConfig({
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'key',
      }),
      now: new Date('2026-09-19T00:00:00Z'),
    });

    expect(result).toEqual([]);
    expect(fromMock).toHaveBeenCalledWith('social_posts');
  });
});
