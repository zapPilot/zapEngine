export class PollTimeoutError extends Error {
  readonly lastValue: unknown;

  constructor(message: string, lastValue?: unknown) {
    super(message);
    this.name = 'PollTimeoutError';
    this.lastValue = lastValue;
  }
}

export interface PollUntilOptions<T> {
  fn: () => Promise<T>;
  shouldStop: (value: T) => boolean;
  /** Base delay between attempts. */
  intervalMs?: number;
  /** Multiplier applied to the delay only after `fn` throws; resets on success. */
  backoffFactor?: number;
  maxIntervalMs?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  onAttempt?: (value: T | undefined, error?: unknown) => void;
}

function abortError(): DOMException {
  return new DOMException('Polling aborted', 'AbortError');
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }

    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Poll `fn` until `shouldStop` accepts its value. Transient `fn` failures never
 * fail the poll — they back off and retry; only `timeoutMs` (PollTimeoutError)
 * or `signal` abort (DOMException 'AbortError') terminate exceptionally.
 */
export async function pollUntil<T>({
  fn,
  shouldStop,
  intervalMs = 5_000,
  backoffFactor = 1.5,
  maxIntervalMs = 30_000,
  timeoutMs = 15 * 60_000,
  signal,
  onAttempt,
}: PollUntilOptions<T>): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let delay = intervalMs;
  let lastValue: T | undefined;

  for (;;) {
    if (signal?.aborted) {
      throw abortError();
    }

    try {
      const value = await fn();
      lastValue = value;
      onAttempt?.(value);
      if (shouldStop(value)) {
        return value;
      }
      delay = intervalMs;
    } catch (error) {
      onAttempt?.(undefined, error);
      delay = Math.min(delay * backoffFactor, maxIntervalMs);
    }

    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      throw new PollTimeoutError(
        `Polling timed out after ${timeoutMs}ms`,
        lastValue,
      );
    }

    await sleep(Math.min(delay, remaining), signal);
  }
}
