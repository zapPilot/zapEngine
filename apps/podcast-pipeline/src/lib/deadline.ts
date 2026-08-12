import {
  abortError,
  combineAbortSignalWithTimeout,
} from '../services/video/abort.js';

export async function runWithDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  parentSignal: AbortSignal | undefined,
  timeoutMs: number,
  label: string,
): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error(`${label} timeout must be a positive number`);
  }
  if (parentSignal?.aborted) {
    throw abortError(parentSignal, `${label} aborted`);
  }
  const deadline = combineAbortSignalWithTimeout(
    parentSignal,
    timeoutMs,
    `${label} timed out after ${timeoutMs}ms`,
  );
  const onAbort = (): void => {
    rejectAbort(abortError(deadline.signal, `${label} aborted`));
  };
  let rejectAbort!: (error: Error) => void;
  const aborted = new Promise<never>((_resolve, reject) => {
    rejectAbort = reject;
    if (deadline.signal.aborted) {
      onAbort();
      return;
    }
    deadline.signal.addEventListener('abort', onAbort, { once: true });
  });

  try {
    return await Promise.race([
      Promise.resolve().then(() => operation(deadline.signal)),
      aborted,
    ]);
  } finally {
    deadline.signal.removeEventListener('abort', onAbort);
    deadline.dispose();
  }
}
