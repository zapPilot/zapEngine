export interface AsyncCache<T> {
  get(force?: boolean): Promise<T>;
}

export function createAsyncCache<T>(input: {
  load: (force: boolean) => Promise<T>;
  ttlMs: number;
  now?: () => number;
  /** A resolved payload that reports its own failure, e.g. `status: 'error'`, is
   * not a cacheable value: retain nothing so the next read retries. */
  isError?: (value: T) => boolean;
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
      pending = input.load(force);
      try {
        const value = await pending;
        cached = input.isError?.(value)
          ? null
          : { value, expiresAt: now() + input.ttlMs };
        return value;
      } finally {
        pending = null;
      }
    },
  };
}
