import { z } from 'zod';

/** Versioned together with the CTA copy and telemetry; never reuse for a new test. */
export const LANDING_CTA_EXPERIMENT = 'landing-waitlist-cta-v2';
export const landingCtaContextSchema = z.object({
  key: z.literal(LANDING_CTA_EXPERIMENT),
  variant: z.enum(['baseline', 'control', 'value_first']),
  exposureId: z.uuid(),
});
export type LandingCtaContext = z.infer<typeof landingCtaContextSchema>;
