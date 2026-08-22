import { describe, expect, it } from 'vitest';

import { resolvePricingRate } from './pricing.js';

describe('resolvePricingRate', () => {
  it('selects the rate active at the snapshot time', () => {
    const rate = resolvePricingRate(
      [
        {
          id: 'old',
          provider: 'debank',
          metricKey: 'api_unit',
          unit: 'unit',
          priceUsd: 0.0002,
          effectiveFrom: '2026-08-01T00:00:00.000Z',
          effectiveTo: '2027-01-01T00:00:00.000Z',
        },
        {
          id: 'new',
          provider: 'debank',
          metricKey: 'api_unit',
          unit: 'unit',
          priceUsd: 0.00025,
          effectiveFrom: '2027-01-01T00:00:00.000Z',
          effectiveTo: null,
        },
      ],
      {
        provider: 'debank',
        metricKey: 'api_unit',
        at: new Date('2026-08-22T00:00:00.000Z'),
      },
    );

    expect(rate?.id).toBe('old');
    expect(rate?.priceUsd).toBe(0.0002);
  });
});
