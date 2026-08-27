import { describe, expect, it } from 'vitest';

import { buildAnalyticsConfig } from '@/observability/analyticsConfig';

describe('buildAnalyticsConfig', () => {
  it('returns nothing without a project key', () => {
    expect(buildAnalyticsConfig(undefined, 'https://us.i.posthog.com')).toBe(
      undefined,
    );
    expect(buildAnalyticsConfig('   ', 'https://us.i.posthog.com')).toBe(
      undefined,
    );
  });

  it('trims the surrounding whitespace an env store can carry', () => {
    expect(
      buildAnalyticsConfig(' phc_test ', ' https://eu.i.posthog.com '),
    ).toEqual({
      key: 'phc_test',
      apiHost: 'https://eu.i.posthog.com',
    });
  });

  it('omits the ingest host so the SDK default applies', () => {
    const config = buildAnalyticsConfig('phc_test', '  ');

    expect(config).toEqual({ key: 'phc_test' });
    expect(config).not.toHaveProperty('apiHost');
  });
});
