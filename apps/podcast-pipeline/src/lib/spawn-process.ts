export interface Settler<T> {
  settleResolve: (value: T) => void;
  settleReject: (error: Error) => void;
}

/**
 * Guards a promise's `resolve`/`reject` pair so only the first call takes
 * effect, running `cleanup` exactly once before it. `runProcess` (ffmpeg) and
 * `runRasterStage` (satori/resvg/sharp) both spawn a child process that can
 * settle from more than one event (`exit`, `error`, an abort) and need the
 * same double-settle protection.
 */
export function settleOnce<T>(
  resolve: (value: T) => void,
  reject: (error: Error) => void,
  cleanup: () => void,
): Settler<T> {
  let settled = false;
  return {
    settleResolve: (value: T): void => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    },
    settleReject: (error: Error): void => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    },
  };
}

export interface KillableChild {
  kill(signal: NodeJS.Signals): unknown;
}

/**
 * Wires an `AbortSignal` to a child process: `SIGTERM` immediately, then a
 * `SIGKILL` escalation after `graceMs` (default 2s) for a child that ignores
 * the first signal. Fires immediately if `signal` is already aborted.
 * Returns a cleanup function that removes the listener and cancels a
 * still-pending escalation timer — call it once the process has settled so a
 * child that exits cleanly within the grace window never gets the follow-up
 * `SIGKILL`.
 */
export function killOnAbort(
  child: KillableChild,
  signal: AbortSignal | undefined,
  graceMs = 2_000,
): () => void {
  let forceKillTimer: NodeJS.Timeout | undefined;
  const onAbort = (): void => {
    child.kill('SIGTERM');
    forceKillTimer = setTimeout(() => child.kill('SIGKILL'), graceMs);
    forceKillTimer.unref?.();
  };
  signal?.addEventListener('abort', onAbort, { once: true });
  if (signal?.aborted) onAbort();
  return () => {
    signal?.removeEventListener('abort', onAbort);
    if (forceKillTimer) clearTimeout(forceKillTimer);
  };
}
