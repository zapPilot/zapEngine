import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('../services/supabase-client.js', () => ({
  getPipelineSupabase: () => mocks,
  throwSupabaseError: (error: unknown) => {
    throw error;
  },
}));
import { recoverOrphanedSocialLeases } from './daemon-lease-recovery.js';

beforeEach(() => vi.clearAllMocks());

function fixture(owners: (string | null)[], changed = [{ id: 'lane' }]) {
  const read = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    returns: vi.fn().mockResolvedValue({
      data: owners.map((lease_owner) => ({ lease_owner })),
      error: null,
    }),
  };
  const write = {
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    select: vi.fn().mockResolvedValue({ data: changed, error: null }),
  };
  mocks.from.mockReturnValueOnce(read).mockReturnValue(write);
  return { read, write };
}

it('expires all lanes of dead local owners without touching live, foreign or malformed owners', async () => {
  const { write } = fixture([
    'mac:73977',
    'mac:73977',
    'mac:92662',
    'other:73977',
    null,
    'mac:0',
    'mac:bad',
  ]);
  const isProcessAlive = vi.fn((pid: number) => pid === 92662);
  await recoverOrphanedSocialLeases({
    host: 'mac',
    now: new Date('2026-09-05T00:39:00Z'),
    isProcessAlive,
    log: vi.fn(),
  });
  expect(write.update).toHaveBeenCalledExactlyOnceWith({
    lease_expires_at: '2026-09-05T00:39:00.000Z',
    updated_at: '2026-09-05T00:39:00.000Z',
  });
  expect(write.eq.mock.calls).toEqual([
    ['status', 'processing'],
    ['lease_owner', 'mac:73977'],
  ]);
  expect(isProcessAlive.mock.calls).toEqual([[73977], [92662]]);
});

it('does not report recovery when a concurrent completion or claim wins the CAS', async () => {
  fixture(['mac:73977'], []);
  const log = vi.fn();
  await recoverOrphanedSocialLeases({
    host: 'mac',
    isProcessAlive: () => false,
    log,
  });
  expect(log).not.toHaveBeenCalled();
});

it('fails closed if the database or process check fails', async () => {
  const { read, write } = fixture(['mac:73977']);
  read.returns.mockResolvedValueOnce({
    data: null,
    error: new Error('offline'),
  });
  await expect(recoverOrphanedSocialLeases()).rejects.toThrow('offline');
  expect(write.update).not.toHaveBeenCalled();
});
