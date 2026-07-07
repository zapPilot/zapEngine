import { type RefObject, useCallback, useEffect, useRef } from 'react';

export interface AbortControllerHandle {
  ref: RefObject<AbortController | null>;
  /** Abort the previous run (if any) and arm a fresh controller. */
  renew: () => AbortController;
}

/**
 * Holds the AbortController for a hook's in-flight async watchers: `renew`
 * cancels the previous run when a new one starts, and unmount aborts
 * whatever is left so pollers never outlive their component.
 */
export function useAbortControllerRef(): AbortControllerHandle {
  const ref = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      ref.current?.abort();
    },
    [],
  );

  const renew = useCallback(() => {
    ref.current?.abort();
    const controller = new AbortController();
    ref.current = controller;
    return controller;
  }, []);

  return { ref, renew };
}
