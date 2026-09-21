import { describe, expect, it } from 'vitest';

import { resolveAnalyticsApiUrl } from '../src/config/analyticsApiUrl';

const API = 'https://analytics.example';

describe('analytics host selection (native)', () => {
  it('keeps native requests on the configured API', () => {
    expect(resolveAnalyticsApiUrl(API)).toBe(API);
  });
});
