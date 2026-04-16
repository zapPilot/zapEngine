import { useEffect, useRef, useState } from "react";

/**
 * Shared tooltip state used by pill components (HealthFactorPill, BorrowingHealthPill).
 * Bundles the common visibility + mount + ref pattern to avoid duplication.
 */
export function useTooltipState() {
  const [isVisible, setIsVisible] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  return {
    isVisible,
    setIsVisible,
    isMounted,
    containerRef,
    tooltipRef,
  } as const;
}
