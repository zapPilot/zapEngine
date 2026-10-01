import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { AccessibilityInfo } from 'react-native';

const ReducedMotionContext = createContext(false);
export function ReducedMotionProvider({
  children,
}: {
  children: ReactNode;
}): ReactElement {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let mounted = true;
    let changed = false;
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      (value) => {
        changed = true;
        setEnabled(value);
      },
    );
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (mounted && !changed) setEnabled(value);
      })
      .catch(() => {
        /* Keep the default when the platform cannot report this preference. */
      });
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);
  return (
    <ReducedMotionContext.Provider value={enabled}>
      {children}
    </ReducedMotionContext.Provider>
  );
}
export function useReducedMotion(): boolean {
  return useContext(ReducedMotionContext);
}
