import { beforeEach, expect, it, vi } from 'vitest';
const storage = vi.hoisted(() => ({ getItem: vi.fn(), setItem: vi.fn() }));
vi.mock('@/storage/appKeyValueStorage', () => ({ default: storage }));
beforeEach(() => {
  vi.resetModules();
  storage.getItem.mockReset();
  storage.setItem.mockReset().mockResolvedValue(undefined);
});
it('restores only a valid signed-in hint and contains read failures', async () => {
  const { loadSessionHint } = await import('@/storage/sessionHintStorage');
  storage.getItem.mockResolvedValue('signed_in');
  expect(await loadSessionHint()).toBe(true);
  storage.getItem.mockResolvedValue('signed_out');
  expect(await loadSessionHint()).toBe(false);
  storage.getItem.mockResolvedValue(null);
  expect(await loadSessionHint()).toBe(false);
  storage.getItem.mockRejectedValue(new Error('Storage unavailable'));
  expect(await loadSessionHint()).toBe(false);
});
it('serializes sign-in then sign-out so an older write cannot overwrite logout', async () => {
  const { saveSessionHint } = await import('@/storage/sessionHintStorage');
  const writes: string[] = [];
  let finishFirst!: () => void;
  storage.setItem.mockImplementation(async (_key: string, value: string) => {
    writes.push(value);
    if (value === 'signed_in')
      await new Promise<void>((resolve) => {
        finishFirst = resolve;
      });
  });
  const first = saveSessionHint(true);
  const second = saveSessionHint(false);
  await Promise.resolve();
  expect(writes).toEqual(['signed_in']);
  finishFirst();
  await Promise.all([first, second]);
  expect(writes).toEqual(['signed_in', 'signed_out']);
});
it('keeps iOS independent from financial session hints', async () => {
  const { loadSessionHint, saveSessionHint } =
    await import('@/storage/sessionHintStorage.ios');
  expect(await loadSessionHint()).toBe(false);
  await saveSessionHint(true);
  expect(storage.setItem).not.toHaveBeenCalled();
});
