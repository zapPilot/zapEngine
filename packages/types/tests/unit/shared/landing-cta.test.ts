import { describe, expect, it } from 'vitest';
import {
  landingCtaContextSchema,
  LANDING_CTA_EXPERIMENT,
} from '../../../src/shared/landing-cta.js';

describe('landing CTA context contract', () => {
  it.each(['baseline', 'control', 'value_first'])(
    'accepts the versioned %s arm',
    (variant) => {
      expect(
        landingCtaContextSchema.safeParse({
          key: LANDING_CTA_EXPERIMENT,
          variant,
          exposureId: '12345678-1234-4234-8234-123456789012',
        }).success,
      ).toBe(true);
    },
  );
  it.each([
    { variant: 'winner' },
    { key: 'another-experiment' },
    { exposureId: 'email@example.com' },
  ])('rejects unknown context: %o', (override) => {
    expect(
      landingCtaContextSchema.safeParse({
        key: LANDING_CTA_EXPERIMENT,
        variant: 'control',
        exposureId: '12345678-1234-4234-8234-123456789012',
        ...override,
      }).success,
    ).toBe(false);
  });
});
