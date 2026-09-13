import { useEffect, useState } from 'react';

/**
 * A once-a-second clock for review-expiry countdowns. Only ticks while
 * `active`, so an idle screen holds no interval.
 */
export function useNowTicker(active: boolean, resetKey = ''): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [active, resetKey]);

  return now;
}
