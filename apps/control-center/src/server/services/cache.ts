export interface AsyncCache<T> {
  get(force?: boolean): Promise<T>;
}

export function createAsyncCache<T>(input: {
  load: () => Promise<T>;
  ttlMs: number;
  now?: () => number;
}): AsyncCache<T> {
  let cached: { value: T; expiresAt: number } | null = null;
  let pending: Promise<T> | null = null;
  const now = input.now ?? Date.now;

  return {
    async get(force = false): Promise<T> {
      if (!force && cached && cached.expiresAt > now()) {
        return cached.value;
      }
      if (pending) {
        return pending;
      }
      pending = input.load();
      try {
        const value = await pending;
        cached = { value, expiresAt: now() + input.ttlMs };
        return value;
      } finally {
        pending = null;
      }
    },
  };
}
