import { describe, expect, it, vi } from 'vitest';
import type { createClient } from '@supabase/supabase-js';
import { readControlCenterConfig } from '../../config/env.js';
import { readContentPackagingEvidence } from './content-packaging-source.js';
import { readAllPages, readInChunks } from '../supabase-reads.js';
const config = readControlCenterConfig({
  SUPABASE_URL: 'https://example.com',
  SUPABASE_SERVICE_ROLE_KEY: 'test',
});
function client(rows: Record<string, unknown[] | null>, error: unknown = null) {
  const calls: Array<{ table: string; method: string; args: unknown[] }> = [];
  const factory = vi.fn(() => ({
    from(table: string) {
      const query: Record<string, unknown> = {};
      for (const method of ['select', 'gte', 'eq', 'in', 'order', 'range']) {
        query[method] = (...args: unknown[]) => {
          calls.push({ table, method, args });
          return query;
        };
      }
      query['then'] = (resolve: (value: unknown) => void) =>
        resolve({ data: rows[table] ?? null, error });
      return query;
    },
  }));
  return { factory: factory as unknown as typeof createClient, calls };
}
describe('packaging evidence source', () => {
  it('checks configuration before creating the client', async () => {
    const mock = client({});
    await expect(
      readContentPackagingEvidence({
        config: readControlCenterConfig({}),
        now: new Date(),
        createSupabaseClient: mock.factory,
      }),
    ).rejects.toThrow('Supabase is not connected');
    expect(mock.factory).not.toHaveBeenCalled();
  });
  it('joins evidence in two stages with the manifest cover JSON path and fixed window', async () => {
    const mock = client({
      social_posts: [
        {
          id: 'p',
          episode_id: 'e',
          platform: 'rednote',
          language_code: 'zh-Hant',
          published_at: '2026-09-01T00:00:00Z',
          published_title: 'Title',
          review_status: null,
        },
      ],
      social_post_metrics: [],
      episode_localizations: [],
      episode_videos: [],
    });
    const data = await readContentPackagingEvidence({
      config,
      now: new Date('2026-10-01T00:00:00Z'),
      createSupabaseClient: mock.factory,
    });
    expect(data.posts).toHaveLength(1);
    expect(mock.calls).toContainEqual({
      table: 'episode_videos',
      method: 'select',
      args: [
        'episode_localization_id,episode_id,status,thumbnail_url,completed_at,coverPhoto:manifest->coverPhoto',
      ],
    });
    expect(mock.calls).toContainEqual({
      table: 'social_post_metrics',
      method: 'eq',
      args: ['measurement_window', '24h'],
    });
    expect(mock.calls).toContainEqual({
      table: 'episode_localizations',
      method: 'eq',
      args: ['language_code', 'zh-Hant'],
    });
    expect(mock.calls).toContainEqual({
      table: 'social_posts',
      method: 'range',
      args: [0, 999],
    });
  });
  it('returns no secondary requests on empty rows and rejects invalid evidence or PostgREST errors', async () => {
    const empty = client({});
    expect(
      await readContentPackagingEvidence({
        config,
        now: new Date(),
        createSupabaseClient: empty.factory,
      }),
    ).toEqual({ posts: [], metrics: [], localizations: [], videos: [] });
    const invalid = client({ social_posts: [{ id: 3 }] });
    await expect(
      readContentPackagingEvidence({
        config,
        now: new Date(),
        createSupabaseClient: invalid.factory,
      }),
    ).rejects.toThrow();
    const failed = client({}, { message: 'permission denied' });
    await expect(
      readContentPackagingEvidence({
        config,
        now: new Date(),
        createSupabaseClient: failed.factory,
      }),
    ).rejects.toEqual({ message: 'permission denied' });
  });
});
describe('bounded Supabase reads', () => {
  it('paginates with unique id order until a short page', async () => {
    const range = vi
      .fn()
      .mockResolvedValueOnce({
        data: Array.from({ length: 1000 }, (_, id) => ({ id })),
        error: null,
      })
      .mockResolvedValueOnce({ data: [{ id: 1000 }], error: null });
    const order = vi.fn(() => ({ range }));
    expect(await readAllPages(() => ({ order }))).toHaveLength(1001);
    expect(order).toHaveBeenCalledWith('id', { ascending: true });
    expect(range).toHaveBeenLastCalledWith(1000, 1999);
    await expect(
      readAllPages(() => ({
        order: () => ({
          range: () => Promise.resolve({ data: null, error: 'failed' }),
        }),
      })),
    ).rejects.toBe('failed');
  });
  it('deduplicates ids, chunks at 100 and propagates per-chunk errors', async () => {
    const ids = Array.from({ length: 201 }, (_, id) => String(id));
    const query = vi.fn(async (chunk: string[]) => ({
      data: chunk,
      error: null,
    }));
    expect(await readInChunks([...ids, '0'], query)).toEqual(ids);
    expect(query.mock.calls.map(([chunk]) => chunk.length)).toEqual([
      100, 100, 1,
    ]);
    expect(
      await readInChunks(['a'], async () => ({ data: null, error: null })),
    ).toEqual([]);
    await expect(
      readInChunks(['a'], async () => ({
        data: null,
        error: { message: 'chunk error' },
      })),
    ).rejects.toEqual({ message: 'chunk error' });
  });
});
