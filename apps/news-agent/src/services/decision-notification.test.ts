import { describe, expect, it, vi } from 'vitest';

import {
  action,
  memoryStore,
  now,
  persistedStep,
  wallet,
} from '../test-utils/fixtures.js';
import { decide } from './decision.js';
import { discover } from './discovery.js';
import { message, notify } from './notification.js';

describe('discovery and recognition', () => {
  it('passes idempotency keys and explicit discovery filters to storage', async () => {
    const { store } = memoryStore();
    const since = new Date(now).toISOString();
    await discover(store, 'rule/arm', since, 'episode');
    await discover(store, 'rule/arm', since, 'episode');
    expect(store.discover).toHaveBeenCalledWith(since, 'episode');
    expect(store.insert).toHaveBeenNthCalledWith(
      1,
      action().episode_id,
      'rule/arm',
    );
    expect(store.insert).toHaveBeenNthCalledWith(
      2,
      action().episode_id,
      'rule/arm',
    );
  });
  it('never calls LLM without the deterministic keyword', async () => {
    const h = memoryStore(action({ status: 'pending' }));
    vi.mocked(h.store.episode).mockResolvedValue({
      id: 'id',
      title: 'Other',
      raw_text: 'news',
      source_url: 'url',
    });
    const recognize = vi.fn();
    await decide(h.store, h.row, recognize, 'model', wallet, now);
    expect(h.row.status).toBe('skipped');
    expect(recognize).not.toHaveBeenCalled();
  });
  it.each([true, false])(
    'records recognized match=%s truth',
    async (matches) => {
      const h = memoryStore(action({ status: 'pending' }));
      await decide(
        h.store,
        h.row,
        vi.fn().mockResolvedValue({ matches, evidence: 'article quote' }),
        'model',
        wallet,
        now,
      );
      expect(h.row.status).toBe(matches ? 'approved' : 'skipped');
      expect(h.row.decision).toMatchObject({
        model: 'model',
        evidence: 'article quote',
        action: { fromAmount: '1000000' },
      });
    },
  );
  it('backs off and stops after three failed calls', async () => {
    const h = memoryStore(action({ status: 'pending' }));
    const recognize = vi.fn().mockRejectedValue(new Error('network'));
    let clock = now;
    for (let i = 1; i <= 3; i++) {
      await decide(h.store, h.row, recognize, 'model', wallet, clock);
      expect(h.row.attempt_count).toBe(i);
      await decide(h.store, h.row, recognize, 'model', wallet, clock);
      expect(recognize).toHaveBeenCalledTimes(i);
      clock = Date.parse(h.row.next_attempt_at);
    }
    expect(h.row.status).toBe('skipped');
    expect(h.row.last_error).toBeTruthy();
  });
});
describe('persisted notifications', () => {
  it.each(['confirmed', 'blocked', 'failed', 'needs_attention'] as const)(
    'only uses persisted %s status',
    (status) => {
      const text = message(
        action({ status, steps: [persistedStep()] }),
        'https://example.com/e/episode',
      );
      expect(text.includes('✅')).toBe(status === 'confirmed');
      expect(text).toContain('https://example.com/e/episode');
    },
  );
  it('distinguishes reverted execution from cancellation', () => {
    expect(
      message(
        action({
          status: 'failed',
          steps: [{ ...persistedStep(), outcome: 'reverted', hash: '0xhash' }],
        }),
        'url',
      ),
    ).toContain('已上鏈但 revert');
    expect(message(action({ status: 'failed' }), 'url')).toContain('未執行');
  });
  it.each([
    [
      { videoStatus: 'completed', videoChat: 'video', ingestChat: 'ingest' },
      'video',
    ],
    [
      { videoStatus: 'failed', videoChat: null, ingestChat: 'ingest' },
      'ingest',
    ],
    [{ videoStatus: null, videoChat: null, ingestChat: null }, 'fallback'],
  ])(
    'selects recipient and writes notification only after delivery',
    async (context, chat) => {
      const h = memoryStore(action({ status: 'confirmed' }));
      vi.mocked(h.store.notificationContext).mockResolvedValue(context);
      const send = vi.fn(async () => {
        expect(h.row.notified_at).toBeNull();
      });
      await notify(
        h.store,
        h.row,
        'https://podcast.example/',
        ' fallback,second',
        send,
        now + 12 * 3600_000,
      );
      expect(send).toHaveBeenCalledWith(
        chat,
        expect.any(String),
        expect.stringContaining('?lang=zh-Hant'),
      );
      expect(h.row.notified_at).toBeTruthy();
      await notify(h.store, h.row, 'url', '', send, now);
      expect(send).toHaveBeenCalledTimes(1);
    },
  );
  it('waits for video or timeout, ignores nonterminal actions and retries failed delivery', async () => {
    const h = memoryStore(action({ status: 'confirmed' }));
    vi.mocked(h.store.notificationContext).mockResolvedValue({
      videoStatus: 'processing',
      videoChat: '123',
      ingestChat: null,
    });
    const send = vi.fn().mockRejectedValue(new Error('telegram'));
    await notify(h.store, h.row, 'url', '', send, now);
    expect(send).not.toHaveBeenCalled();
    await notify(h.store, action(), 'url', '', send, now);
    expect(send).not.toHaveBeenCalled();
    await expect(
      notify(h.store, h.row, 'url', '', send, now + 12 * 3600_000),
    ).rejects.toThrow('telegram');
    expect(h.row.notified_at).toBeNull();
    vi.mocked(h.store.notificationContext).mockResolvedValue({
      videoStatus: 'completed',
      videoChat: null,
      ingestChat: null,
    });
    await expect(notify(h.store, h.row, 'url', '', send, now)).rejects.toThrow(
      'recipient',
    );
  });
});
