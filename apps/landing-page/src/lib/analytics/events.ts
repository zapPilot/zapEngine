/**
 * Client analytics helpers for the marketing site.
 *
 * Two sinks, one call site:
 *   - `window.gtag`, loaded by @next/third-parties/google in `app/layout.tsx`.
 *     The global type lives in `src/types/gtag.d.ts` — keep payloads to
 *     string/number/boolean only so that type stays narrow.
 *   - PostHog, initialized in `src/instrumentation-client.ts`. `surface` and the
 *     other shared dimensions are registered there as super-properties, so they
 *     ride along on autocaptured `$pageview` too and are not repeated here.
 *
 * SSR-safe: the `typeof window` guard means imports during prerender are inert.
 */
import posthog from 'posthog-js';

type EventProps = Record<string, string | number | boolean>;

// Next inlines this at build time. Reading the key rather than posthog's
// internal `__loaded` flag keeps the guard on our own public contract, and
// avoids a console warning per event when no project is configured.
const posthogEnabled = Boolean(process.env['NEXT_PUBLIC_POSTHOG_KEY']?.trim());

function fireEvent(name: string, props: EventProps = {}) {
  if (typeof window === 'undefined') return;
  if (typeof window.gtag === 'function') window.gtag('event', name, props);
  if (posthogEnabled) posthog.capture(name, props);
}

export type CtaLocation = 'hero' | 'navbar' | 'closing';

export function trackPitchView() {
  fireEvent('pitch_view', { source: 'pitch_page' });
}

export function trackSlideViewed(slideId: string) {
  fireEvent('pitch_slide_viewed', { slide_id: slideId });
}

export function trackCtaClicked(location: CtaLocation) {
  fireEvent('cta_clicked', { location, target: 'app' });
}
