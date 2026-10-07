'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  LANDING_CTA_EXPERIMENT,
  type LandingCtaContext,
} from '@zapengine/types/shared';
import { subscribeCtaVariant } from '@/lib/analytics/cta-experiment';
import { trackCtaDiagnostic } from '@/lib/analytics/events';

const CtaContext = createContext<{
  assignment: LandingCtaContext | null;
  ensureAssignment: () => LandingCtaContext | null;
}>({ assignment: null, ensureAssignment: () => null });

/** Freeze the rendered assignment for this visit, including clicks before flag load. */
export function CtaExperiment({ children }: { children: ReactNode }) {
  const current = useRef<LandingCtaContext | null>(null);
  const [assignment, setAssignment] = useState<LandingCtaContext | null>(null);
  const assign = useCallback((variant: LandingCtaContext['variant']) => {
    if (!current.current) {
      current.current = {
        key: LANDING_CTA_EXPERIMENT,
        variant,
        exposureId: crypto.randomUUID(),
      };
      setAssignment(current.current);
      trackCtaDiagnostic('landing_cta_exposed', current.current, {
        visibility_supported: typeof IntersectionObserver !== 'undefined',
      });
    }
    return current.current;
  }, []);
  useEffect(() => {
    const unsubscribe = subscribeCtaVariant(assign);
    // A blocked flag request must never block a working CTA or invent a control arm.
    const timeout = window.setTimeout(() => assign('baseline'), 2000);
    return () => {
      unsubscribe();
      window.clearTimeout(timeout);
    };
  }, [assign]);
  return (
    <CtaContext.Provider
      value={{ assignment, ensureAssignment: () => assign('baseline') }}
    >
      {children}
    </CtaContext.Provider>
  );
}

export function useCtaExperiment() {
  return useContext(CtaContext);
}
