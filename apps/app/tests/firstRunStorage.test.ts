import { beforeEach, expect, it, vi } from 'vitest';
const storage = vi.hoisted(() => ({ getItem: vi.fn(), setItem: vi.fn() }));
vi.mock('@/storage/appKeyValueStorage', () => ({ default: storage }));
beforeEach(() => {
  vi.resetModules();
  storage.getItem.mockReset();
  storage.setItem.mockReset().mockResolvedValue(undefined);
});
it('restores only the durable seen flag and contains storage read failures', async () => {
  const { loadFirstRunSeen, markFirstRunSeen } =
    await import('@/storage/firstRunStorage');
  for (const value of [null, 'other']) {
    storage.getItem.mockResolvedValue(value);
    expect(await loadFirstRunSeen()).toBe(false);
  }
  storage.getItem.mockResolvedValue('seen');
  expect(await loadFirstRunSeen()).toBe(true);
  storage.getItem.mockRejectedValue(new Error('device storage unavailable'));
  expect(await loadFirstRunSeen()).toBe(false);
  await markFirstRunSeen();
  expect(storage.setItem).toHaveBeenCalledWith(
    'zap_pilot_first_run_seen',
    'seen',
  );
});
