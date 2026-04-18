import { useState, useEffect } from 'react';

interface UseResponsiveLayoutOptions {
  breakpoint?: number;
  throttleDelay?: number;
}

/**
 * Custom hook to detect responsive layout changes
 * @param options Configuration options for responsive detection
 * @returns boolean indicating if the viewport is below the breakpoint
 */
export function useResponsiveLayout({
  breakpoint = 768,
  throttleDelay = 150,
}: UseResponsiveLayoutOptions = {}) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < breakpoint);
    };

    // Check on mount
    checkMobile();

    let timeoutId: NodeJS.Timeout;
    const throttledResize = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(checkMobile, throttleDelay);
    };

    window.addEventListener('resize', throttledResize);
    return () => {
      window.removeEventListener('resize', throttledResize);
      clearTimeout(timeoutId);
    };
  }, [breakpoint, throttleDelay]);

  return isMobile;
}
