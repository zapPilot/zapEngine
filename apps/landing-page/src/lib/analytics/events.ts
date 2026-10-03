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
import type { LandingCtaContext } from '@zapengine/types/shared';
import { ctaEventProperties } from './cta-experiment';

type EventProps = Record<string, string | number | boolean>;

// Next inlines this at build time. Reading the key rather than posthog's
// internal `__loaded` flag keeps the guard on our own public contract, and
// avoids a console warning per event when no project is configured.
const posthogEnabled = Boolean(process.env['NEXT_PUBLIC_POSTHOG_KEY']?.trim());

function fireEvent(
  name: string,
  props: EventProps = {},
  options: { beacon?: boolean } = {},
) {
  if (typeof window === 'undefined') return;
  try {
    if (typeof window.gtag === 'function')
      window.gtag(
        'event',
        name,
        options.beacon ? { ...props, transport_type: 'beacon' } : props,
      );
    if (posthogEnabled) {
      if (options.beacon)
        posthog.capture(name, props, { transport: 'sendBeacon' });
      else posthog.capture(name, props);
    }
  } catch {
    /* Analytics is best-effort and cannot prevent signup. */
  }
}

export type CtaLocation = 'hero' | 'navbar' | 'closing';

export function trackPitchView() {
  fireEvent('pitch_view', { source: 'pitch_page' });
}

export function trackSlideViewed(slideId: string) {
  fireEvent('pitch_slide_viewed', { slide_id: slideId });
}

export function trackCtaClicked(
  location: CtaLocation,
  context: LandingCtaContext | null = null,
) {
  fireEvent('waitlist_cta_clicked', {
    location,
    target: 'waitlist',
    ...ctaEventProperties(context),
  });
}

export function trackWaitlistSubmitted(
  location: CtaLocation,
  socialAttributed: boolean,
  context: LandingCtaContext | null = null,
) {
  fireEvent('waitlist_submitted', {
    location,
    social_attributed: socialAttributed,
    ...ctaEventProperties(context),
  });
}

export type DiscordCtaLocation =
  | 'waitlist_success'
  | 'closing'
  | 'footer'
  | 'redirect';

export function trackDiscordCtaClicked(
  location: DiscordCtaLocation,
  postWaitlist: boolean,
  options?: { beacon?: boolean },
) {
  fireEvent(
    'discord_cta_clicked',
    { location, target: 'discord', post_waitlist: postWaitlist },
    options,
  );
}

export type CtaDiagnosticEvent =
  | 'landing_cta_exposed'
  | 'waitlist_cta_visible'
  | 'waitlist_form_opened'
  | 'waitlist_form_started'
  | 'waitlist_submit_attempted'
  | 'waitlist_form_error'
  | 'waitlist_form_closed';

export type CtaFailureReason =
  | 'required_email'
  | 'invalid_email'
  | 'rate_limited'
  | 'server_error'
  | 'request_rejected'
  | 'network_or_timeout';

/** Explicit dimensions only: never include email, input text, response bodies or raw errors. */
export function trackCtaDiagnostic(
  event: CtaDiagnosticEvent,
  context: LandingCtaContext | null,
  detail: {
    location?: CtaLocation;
    reason?: CtaFailureReason;
    started?: boolean;
    submitted?: boolean;
    visibility_supported?: boolean;
  } = {},
) {
  fireEvent(
    event,
    { ...ctaEventProperties(context), ...detail, surface: 'landing' },
    event === 'waitlist_form_closed' ? { beacon: true } : {},
  );
}
