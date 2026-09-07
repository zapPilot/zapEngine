import { useCallback, useEffect, useRef, useState } from 'react';

interface HydratedStore<Value, Mutation> {
  value: Value;
  isHydrated: boolean;
  /** Applies a mutation now; returns the value after it is applied. */
  commit: (mutation: Mutation) => Value;
}

/**
 * Hydrates a durable value from storage, queuing mutations committed before
 * hydration finishes and replaying them onto the loaded value with a single
 * post-hydration write. Stores that write immediately instead (e.g.
 * `useEpisodeSortDirection`) have a different shape and don't use this hook.
 */
export function useHydratedStore<Value, Mutation>(
  initialValue: Value,
  load: () => Promise<Value>,
  save: (value: Value) => Promise<void> | void,
  reduce: (current: Value, mutation: Mutation) => Value,
): HydratedStore<Value, Mutation> {
  const [value, setValue] = useState(initialValue);
  const [isHydrated, setIsHydrated] = useState(false);
  const valueRef = useRef(value);
  const hydratedRef = useRef(false);
  const pendingRef = useRef<Mutation[]>([]);

  useEffect(() => {
    let active = true;
    void load().then((stored) => {
      if (!active) return;
      const pending = pendingRef.current;
      pendingRef.current = [];
      const hydrated = pending.reduce(reduce, stored);
      hydratedRef.current = true;
      valueRef.current = hydrated;
      setValue(hydrated);
      setIsHydrated(true);
      if (pending.length > 0) void save(hydrated);
    });
    return () => {
      active = false;
    };
  }, [load, reduce, save]);

  const commit = useCallback(
    (mutation: Mutation): Value => {
      if (!hydratedRef.current) pendingRef.current.push(mutation);
      const next = reduce(valueRef.current, mutation);
      if (next === valueRef.current) return next;
      valueRef.current = next;
      setValue(next);
      if (hydratedRef.current) void save(next);
      return next;
    },
    [reduce, save],
  );

  return { value, isHydrated, commit };
}
