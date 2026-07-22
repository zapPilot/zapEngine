export async function runWithDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  parentSignal: AbortSignal | undefined,
  timeoutMs: number,
  label: string,
): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error(`${label} timeout must be a positive number`);
  }
  parentSignal?.throwIfAborted();
  const controller = new AbortController();
  let rejectAbort!: (error: Error) => void;
  const aborted = new Promise<never>((_resolve, reject) => {
    rejectAbort = reject;
  });
  const abort = (error: Error): void => {
    if (controller.signal.aborted) return;
    controller.abort(error);
    rejectAbort(error);
  };
  const onParentAbort = (): void => {
    abort(abortReason(parentSignal, `${label} aborted`));
  };
  parentSignal?.addEventListener('abort', onParentAbort, { once: true });
  const timeout = setTimeout(() => {
    const error = new Error(`${label} timed out after ${timeoutMs}ms`);
    error.name = 'TimeoutError';
    abort(error);
  }, timeoutMs);
  timeout.unref();

  try {
    return await Promise.race([
      Promise.resolve().then(() => operation(controller.signal)),
      aborted,
    ]);
  } finally {
    clearTimeout(timeout);
    parentSignal?.removeEventListener('abort', onParentAbort);
  }
}

export function abortReason(
  signal: AbortSignal | undefined,
  message: string,
): Error {
  if (signal?.reason instanceof Error) return signal.reason;
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}
