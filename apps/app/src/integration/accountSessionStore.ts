export interface StoredAccountSession {
  token: string;
  expiresAt: string;
  createdAt: string;
}
export interface AccountSessionStorage {
  load(key: string): Promise<string | null>;
  save(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export function createAccountSessionStore(storage: AccountSessionStorage) {
  const cache = new Map<string, StoredAccountSession>();
  const generations = new Map<string, number>();
  const writes = new Map<string, Promise<void>>();
  const key = (id: string) => `zap-owner-session-${id}`;
  const enqueue = (id: string, task: () => Promise<void>) => {
    const pending = (writes.get(id) ?? Promise.resolve())
      .catch(() => undefined)
      .then(task);
    writes.set(id, pending);
    return pending;
  };
  return {
    async get(
      userId: string,
      recent = false,
    ): Promise<StoredAccountSession | null> {
      const generation = generations.get(userId) ?? 0;
      let session = cache.get(userId);
      if (!session) {
        const raw = await storage.load(key(userId));
        if ((generations.get(userId) ?? 0) !== generation) {
          session = cache.get(userId);
        } else if (raw) {
          try {
            const parsed: unknown = JSON.parse(raw);
            if (
              parsed &&
              typeof parsed === 'object' &&
              'token' in parsed &&
              typeof parsed.token === 'string' &&
              'expiresAt' in parsed &&
              typeof parsed.expiresAt === 'string' &&
              'createdAt' in parsed &&
              typeof parsed.createdAt === 'string'
            ) {
              session = {
                token: parsed.token,
                expiresAt: parsed.expiresAt,
                createdAt: parsed.createdAt,
              };
              cache.set(userId, session);
            }
          } catch {
            return null;
          }
        }
      }
      if (!session || !(Date.parse(session.expiresAt) > Date.now()))
        return null;
      if (
        recent &&
        !(Date.parse(session.createdAt) >= Date.now() - 10 * 60 * 1000)
      )
        return null;
      return session;
    },
    set(userId: string, session: StoredAccountSession): Promise<void> {
      generations.set(userId, (generations.get(userId) ?? 0) + 1);
      cache.set(userId, session);
      return enqueue(userId, () =>
        storage.save(key(userId), JSON.stringify(session)),
      );
    },
    clear(userId: string): Promise<void> {
      generations.set(userId, (generations.get(userId) ?? 0) + 1);
      cache.delete(userId);
      return enqueue(userId, () => storage.remove(key(userId)));
    },
  };
}
