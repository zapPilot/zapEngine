export interface KeyValueStorage {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
}

export interface SerializedWriter {
  write: (key: string, value: string) => Promise<void>;
  /** Resolves once every write enqueued so far has settled. */
  flush: () => Promise<void>;
}

/**
 * Serializes writes to a key-value backend so a slower earlier write can
 * never land after a newer value.
 */
export function createSerializedWriter(
  storage: KeyValueStorage,
): SerializedWriter {
  let writeQueue = Promise.resolve();

  const write = (key: string, value: string): Promise<void> => {
    const pending = writeQueue.then(
      () => storage.setItem(key, value),
      () => storage.setItem(key, value),
    );
    writeQueue = pending.catch(() => undefined);
    return writeQueue;
  };

  return {
    write,
    flush: () => writeQueue,
  };
}
