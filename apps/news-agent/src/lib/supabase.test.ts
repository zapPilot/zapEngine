import { beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: mock.createClient }));
import { action, now } from '../test-utils/fixtures.js';
import { createStore } from './supabase.js';

function database() {
  const replies: { data: unknown; error: unknown }[] = [];
  const methods = [
    'select',
    'eq',
    'in',
    'not',
    'neq',
    'gte',
    'is',
    'upsert',
    'order',
    'limit',
    'update',
    'single',
    'maybeSingle',
  ];
  const query: Record<string, unknown> = {};
  for (const method of methods) query[method] = vi.fn(() => query);
  query['then'] = (resolve: (value: unknown) => unknown) =>
    Promise.resolve(replies.shift() ?? { data: null, error: null }).then(
      resolve,
    );
  const from = vi.fn(() => query);
  mock.createClient.mockReturnValue({ from });
  return {
    replies,
    query,
    from,
    store: createStore('https://db.example', 'service-key'),
  };
}
beforeEach(() => vi.clearAllMocks());
describe('Supabase persistence contract', () => {
  it('uses the isolated schema, eligible zh-Hant rows and upsert conflict keys', async () => {
    const h = database();
    const row = {
      episode_id: 'id',
      title: 'Bitget',
      raw_text: 'article',
      episodes: { source_url: 'https://example.com' },
    };
    h.replies.push({ data: [row], error: null });
    expect(await h.store.discover('since')).toEqual([
      {
        id: 'id',
        title: 'Bitget',
        raw_text: 'article',
        source_url: 'https://example.com',
      },
    ]);
    expect(h.query['gte']).toHaveBeenCalledWith('episodes.created_at', 'since');
    h.replies.push({ data: [row], error: null });
    await h.store.discover('since', 'id');
    expect(h.query['eq']).toHaveBeenCalledWith('episode_id', 'id');
    h.replies.push({ data: row, error: null });
    await h.store.episode('id');
    h.replies.push({ data: null, error: null });
    await expect(h.store.episode('localization-id')).rejects.toThrow(
      'not a localization id',
    );
    await h.store.insert('id', 'rule');
    expect(h.query['upsert']).toHaveBeenCalledWith(
      { episode_id: 'id', rule_version: 'rule' },
      { onConflict: 'episode_id,rule_version', ignoreDuplicates: true },
    );
    expect(mock.createClient).toHaveBeenCalledWith(
      'https://db.example',
      'service-key',
      expect.objectContaining({ db: { schema: 'from_fed_to_chain' } }),
    );
    expect(await h.store.discover('since')).toEqual([]);
  });
  it('fences every write using status, timestamp, claim token and notification state', async () => {
    const h = database();
    const initial = action();
    h.replies.push({ data: initial, error: null });
    expect(await h.store.cas(initial, { status: 'submitting' })).toEqual(
      initial,
    );
    expect(h.query['eq']).toHaveBeenCalledWith('status', 'approved');
    expect(h.query['is']).toHaveBeenCalledWith('claim_token', null);
    expect(h.query['is']).toHaveBeenCalledWith('notified_at', null);
    const claimed = action({
      claim_token: 'token',
      notified_at: new Date(now).toISOString(),
    });
    await h.store.cas(claimed, {});
    expect(h.query['eq']).toHaveBeenCalledWith('claim_token', 'token');
    expect(h.query['eq']).toHaveBeenCalledWith(
      'notified_at',
      claimed.notified_at,
    );
    h.replies.push({
      data: null,
      error: { message: 'duplicate arm', code: '23505' },
    });
    await expect(h.store.cas(initial, {})).rejects.toMatchObject({
      code: '23505',
    });
  });
  it('queries actions with limits and reads video/ingest recipient fallback', async () => {
    const h = database();
    h.replies.push({ data: [action()], error: null });
    expect(await h.store.list(['approved'], 'rule')).toHaveLength(1);
    expect(h.query['eq']).toHaveBeenCalledWith('rule_version', 'rule');
    expect(h.query['limit']).toHaveBeenCalledWith(100);
    h.replies.push({ data: [], error: null });
    await h.store.list(['confirmed'], undefined, 20, true);
    expect(h.query['is']).toHaveBeenCalledWith('notified_at', null);
    h.replies.push(
      { data: { status: 'completed', telegram_chat_id: 'video' }, error: null },
      { data: { source_url: 'url' }, error: null },
      { data: { telegram_chat_id: 'ingest' }, error: null },
    );
    expect(await h.store.notificationContext('id')).toEqual({
      videoStatus: 'completed',
      videoChat: 'video',
      ingestChat: 'ingest',
    });
    h.replies.push(
      { data: null, error: null },
      { data: { source_url: 'url' }, error: null },
      { data: null, error: null },
    );
    expect(await h.store.notificationContext('id')).toEqual({
      videoStatus: null,
      videoChat: null,
      ingestChat: null,
    });
    expect(h.query['eq']).toHaveBeenCalledWith(
      'episode_localizations.language_code',
      'zh-Hant',
    );
  });
});
