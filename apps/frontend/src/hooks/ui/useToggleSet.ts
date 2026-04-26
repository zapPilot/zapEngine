import { useCallback, useState } from 'react';

export interface UseToggleSetOptions<T> {
  initialValue?: Iterable<T>;
}

export interface UseToggleSetReturn<T> {
  activeSet: ReadonlySet<T>;
  toggle: (key: T) => void;
  has: (key: T) => boolean;
}

export function useToggleSet<T>(
  options: UseToggleSetOptions<T> = {},
): UseToggleSetReturn<T> {
  const { initialValue = [] } = options;

  const [activeSet, setActiveSet] = useState<ReadonlySet<T>>(() => {
    const initial = new Set<T>();
    for (const item of initialValue) {
      initial.add(item);
    }
    return initial;
  });

  const toggle = useCallback((key: T) => {
    setActiveSet((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const has = useCallback((key: T) => activeSet.has(key), [activeSet]);

  return { activeSet, toggle, has };
}
