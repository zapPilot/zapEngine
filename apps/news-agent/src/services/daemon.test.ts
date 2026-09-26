import { afterEach, expect, it, vi } from 'vitest';
vi.mock('./decision.js', () => ({ decide: vi.fn() }));
vi.mock('./discovery.js', () => ({ discover: vi.fn() }));
vi.mock('./execution.js', () => ({ execute: vi.fn() }));
vi.mock('./notification.js', () => ({
  notifiable: ['confirmed'],
  notify: vi.fn(),
}));
vi.mock('node:timers/promises', () => ({ setTimeout: vi.fn() }));
import { setTimeout } from 'node:timers/promises';

import {
  action,
  approvedReview,
  memoryStore,
  wallet,
} from '../test-utils/fixtures.js';
import { daemon } from './daemon.js';
import { decide } from './decision.js';
import { discover } from './discovery.js';
import { execute } from './execution.js';
import { notify } from './notification.js';

function setup(execute = false) {
  const h = memoryStore();
  vi.mocked(h.store.list).mockResolvedValue([action()]);
  return {
    values: {
      once: true,
      execute,
      arm: 'demo',
      since: '2026-09-26',
      episode: 'id',
    },
    env: {
      supabaseUrl: 'url',
      supabaseKey: 'key',
      dbSchema: 'from_fed_to_chain' as const,
      accountUrl: 'url',
      podcastUrl: 'https://podcast.example',
      rpcUrl: 'url',
      model: 'model',
      openrouterKey: 'key',
      openrouterUrl: 'url',
      telegramToken: 'token',
      allowedUserIds: '123',
    },
    http: { getJson: vi.fn(), postJson: vi.fn() },
    store: h.store,
    chain: {
      assertChain: vi.fn(),
      nonce: vi.fn(),
      prepare: vi.fn(),
      receipt: vi.fn(),
    },
    multibaas: {
      chainStatus: vi.fn(),
      listHsmWallets: vi.fn(),
      submit: vi.fn(),
      txmByNonce: vi.fn(),
    },
    wallet,
    review: vi.fn().mockResolvedValue(approvedReview()),
    recognize: vi.fn(),
  };
}
afterEach(() => vi.clearAllMocks());
it.each([false, true])(
  'runs once execute=%s and separates notifications from dry-run',
  async (live) => {
    const input = setup(live);
    await daemon(input);
    expect(discover).toHaveBeenCalledWith(
      input.store,
      'bitget-eth-pressure-v1/demo',
      '2026-09-26',
      'id',
    );
    expect(decide).toHaveBeenCalled();
    expect(execute).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ wallet }),
      !live,
    );
    expect(vi.mocked(notify).mock.calls.length).toBe(live ? 1 : 0);
    const dependencies = vi.mocked(execute).mock.calls[0]![1];
    await dependencies.sleep(1);
    expect(setTimeout).toHaveBeenCalledWith(1);
  },
);
it('uses rolling lookback, stops on SIGTERM and removes signal listeners', async () => {
  const input = setup();
  input.values = {
    once: false,
    execute: false,
    arm: '',
    since: '',
    episode: '',
  };
  delete (input.values as Partial<typeof input.values>).arm;
  delete (input.values as Partial<typeof input.values>).since;
  const before = process.listenerCount('SIGTERM');
  vi.mocked(setTimeout).mockImplementation(async () => {
    process.emit('SIGTERM');
  });
  await daemon(input);
  expect(process.listenerCount('SIGTERM')).toBe(before);
  expect(discover).toHaveBeenCalledWith(
    input.store,
    'bitget-eth-pressure-v1/dry-run',
    expect.any(String),
    '',
  );
});
it('does not start another execution after a stop signal', async () => {
  const input = setup();
  vi.mocked(decide).mockImplementationOnce(async () => {
    process.emit('SIGINT');
  });
  await daemon(input);
  expect(execute).not.toHaveBeenCalled();
});
it('logs a failed iteration and retries on the next pass unless running once', async () => {
  const input = setup();
  vi.mocked(discover).mockRejectedValue(
    new Error('fetch failed https://rpc.example/secret'),
  );
  await expect(daemon(input)).rejects.toThrow('fetch failed');
  input.values.once = false;
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.mocked(setTimeout).mockImplementationOnce(async () => {
    process.emit('SIGTERM');
  });
  await daemon(input);
  expect(error).toHaveBeenCalledWith(
    'News agent iteration failed: Error: fetch failed <url>',
  );
  error.mockRestore();
  vi.mocked(discover).mockReset();
});
