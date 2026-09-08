/**
 * Resolve after `ms` milliseconds. Used by retry/backoff loops and polling.
 * `ms <= 0` resolves immediately without scheduling a timer.
 *
 * When `signal` is given and aborts before `ms` elapses, the returned promise
 * rejects with an `AbortError` instead of resolving, and the timer is
 * cleared. A signal that is already aborted rejects immediately (unless
 * `ms <= 0`, which always resolves).
 */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }

  if (signal?.aborted) {
    return Promise.reject(sleepAbortError(signal));
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    function onAbort(): void {
      clearTimeout(timer);
      reject(sleepAbortError(signal));
    }

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function sleepAbortError(signal: AbortSignal | undefined): Error {
  const reason = signal?.reason;
  if (reason instanceof Error) {
    return reason;
  }

  const error = new Error(
    typeof reason === 'string' && reason.trim() ? reason : 'sleep aborted',
  );
  error.name = 'AbortError';
  return error;
}
