export function abortError(
  signal: AbortSignal | undefined,
  fallbackMessage = 'Operation aborted',
): Error {
  const reason = signal?.reason;
  if (reason instanceof Error) return reason;

  const error = new Error(
    typeof reason === 'string' && reason.trim() ? reason : fallbackMessage,
  );
  error.name = 'AbortError';
  return error;
}

export function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw abortError(signal);
}

export interface CombinedAbortSignal {
  signal: AbortSignal;
  dispose(): void;
}

export function combineAbortSignalWithTimeout(
  signal: AbortSignal | undefined,
  timeoutMs: number,
  timeoutMessage: string,
): CombinedAbortSignal {
  const controller = new AbortController();
  const abortFromParent = () => controller.abort(signal?.reason);
  signal?.addEventListener('abort', abortFromParent, { once: true });

  const timeout = setTimeout(() => {
    const error = new Error(timeoutMessage);
    error.name = 'TimeoutError';
    controller.abort(error);
  }, timeoutMs);
  timeout.unref?.();

  if (signal?.aborted) abortFromParent();

  return {
    signal: controller.signal,
    dispose() {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abortFromParent);
    },
  };
}
