/**
 * Pitch-deck analytics helpers.
 *
 * Wraps `window.gtag` (loaded by @next/third-parties/google in
 * `app/layout.tsx`). The global type lives in `src/types/gtag.d.ts` — keep
 * payloads to string/number/boolean only so the type stays narrow there.
 *
 * SSR-safe: `typeof window` guard means imports during prerender are inert.
 */

type GAEventParams = Record<string, string | number | boolean>;

function fireEvent(name: string, params: GAEventParams = {}) {
  if (typeof window === 'undefined') return;
  if (typeof window.gtag !== 'function') return;
  window.gtag('event', name, params);
}

export function trackPitchView() {
  fireEvent('pitch_view', { source: 'pitch_page' });
}

export function trackSlideViewed(slideId: string) {
  fireEvent('pitch_slide_viewed', { slide_id: slideId });
}
