'use client';

import { useEffect, useState } from 'react';

/**
 * Top scroll-progress bar for the /pitch deck.
 *
 * Uses requestAnimationFrame throttling on the scroll event — single rAF
 * per frame, no setTimeout, no debounce, no measurement work off the main
 * paint. The transform is scaleX(0..1) so the GPU compositor handles the
 * paint and the browser does not have to relayout each frame.
 */
export function PitchProgressBar() {
  const [scale, setScale] = useState(0);

  useEffect(() => {
    let frame = 0;

    const update = () => {
      frame = 0;
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      const next = max <= 0 ? 0 : window.scrollY / max;
      setScale(Math.min(1, Math.max(0, next)));
    };

    const onScroll = () => {
      if (frame !== 0) return;
      frame = requestAnimationFrame(update);
    };

    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });

    return () => {
      if (frame !== 0) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  return (
    <div
      className="pitch-progress"
      role="progressbar"
      aria-label="Pitch scroll progress"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(scale * 100)}
      style={{ transform: `scaleX(${scale})` }}
    />
  );
}
