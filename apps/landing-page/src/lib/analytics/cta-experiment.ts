import posthog from 'posthog-js';
import {
  LANDING_CTA_EXPERIMENT,
  type LandingCtaContext,
} from '@zapengine/types/shared';

/** No random local fallback: unavailable/disabled flags are observational baseline. */
export function resolveCtaVariant(
  value: unknown,
): LandingCtaContext['variant'] {
  return value === 'control' || value === 'value_first' ? value : 'baseline';
}

export function ctaEventProperties(
  context: LandingCtaContext | null,
): Record<string, string | number | boolean> {
  return context
    ? {
        cta_experiment_key: context.key,
        cta_variant: context.variant,
        cta_exposure_id: context.exposureId,
        cta_schema_version: 1,
      }
    : {};
}

export function subscribeCtaVariant(
  onVariant: (variant: LandingCtaContext['variant']) => void,
) {
  if (
    !process.env['NEXT_PUBLIC_POSTHOG_KEY']?.trim() ||
    window.navigator.doNotTrack === '1' ||
    posthog.has_opted_out_capturing()
  ) {
    onVariant('baseline');
    return () => undefined;
  }
  return posthog.onFeatureFlags(() => {
    onVariant(
      resolveCtaVariant(
        posthog.getFeatureFlag(LANDING_CTA_EXPERIMENT, { send_event: false }),
      ),
    );
  });
}
