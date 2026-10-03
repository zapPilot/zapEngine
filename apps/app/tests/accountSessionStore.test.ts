import { describe, expect, it, vi } from 'vitest';
import { createAccountSessionStore } from '../src/integration/accountSessionStore';

const entry = () => ({
  token: 'token',
  createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 300000).toISOString(),
});
function setup() {
  const storage = {
    load: vi.fn().mockResolvedValue(null),
    save: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
  };
  return { storage, store: createAccountSessionStore(storage) };
}
describe('durable account session store', () => {
  it('caches and persists sessions independently by user', async () => {
    const { store, storage } = setup();
    const session = entry();
    await store.set('u', session);
    expect(await store.get('u', true)).toEqual(session);
    expect(storage.load).not.toHaveBeenCalled();
    expect(storage.save).toHaveBeenCalledWith(
      'zap-owner-session-u',
      JSON.stringify(session),
    );
    expect(await store.get('other')).toBeNull();
    await store.clear('u');
    expect(await store.get('u')).toBeNull();
  });
  it('hydrates from durable storage', async () => {
    const { store, storage } = setup();
    const session = entry();
    storage.load.mockResolvedValue(JSON.stringify(session));
    expect(await store.get('u')).toEqual(session);
    expect(await store.get('u')).toEqual(session);
    expect(storage.load).toHaveBeenCalledTimes(1);
  });
  it.each(['{', '{}', 'null', '"text"'])(
    'ignores invalid saved payload %s',
    async (raw) => {
      const { store, storage } = setup();
      storage.load.mockResolvedValue(raw);
      expect(await store.get('u')).toBeNull();
    },
  );
  it('requires unexpired and recent sessions when requested', async () => {
    const { store } = setup();
    await store.set('u', { ...entry(), expiresAt: new Date(0).toISOString() });
    expect(await store.get('u')).toBeNull();
    await store.set('u', {
      ...entry(),
      createdAt: new Date(Date.now() - 600001).toISOString(),
    });
    expect(await store.get('u', true)).toBeNull();
    expect(await store.get('u')).not.toBeNull();
  });
  it('does not restore tokens from hydration after explicit clearing', async () => {
    const { store, storage } = setup();
    let resolve!: (raw: string) => void;
    storage.load.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const pending = store.get('u');
    await store.clear('u');
    resolve(JSON.stringify(entry()));
    expect(await pending).toBeNull();
  });
  it('serializes writes and continues after a failed write', async () => {
    const { store, storage } = setup();
    storage.save.mockRejectedValueOnce(new Error('disk'));
    await expect(store.set('u', entry())).rejects.toThrow('disk');
    await store.clear('u');
    expect(storage.remove).toHaveBeenCalledTimes(1);
  });
});
