import { afterEach, describe, expect, it, vi } from 'vitest';

import { resolveAnalyticsApiUrl } from '../src/config/analyticsApiUrl.web';

const API = 'https://analytics.example';

afterEach(() => vi.unstubAllGlobals());

describe('analytics host selection (web)', () => {
  it('keeps ordinary web requests on the configured API', () => {
    vi.stubGlobal('window', undefined);
    expect(resolveAnalyticsApiUrl(API)).toBe(API);
    vi.stubGlobal('window', { location: new URL('https://app.example') });
    expect(resolveAnalyticsApiUrl(API)).toBe(API);
  });

  it('uses the packaged same-origin transport for portfolio and earn queries', () => {
    vi.stubGlobal('window', {
      location: new URL('http://127.0.0.1:3200/home'),
      zapDesktop: {
        platform: 'electron',
        analyticsProxyPath: '/__zap/analytics',
      },
    });
    expect(resolveAnalyticsApiUrl(API)).toBe(
      'http://127.0.0.1:3200/__zap/analytics',
    );
  });

  it('does not rewrite the dev-server or app protocol paths', () => {
    for (const origin of ['http://localhost:8081', 'app://bundle/']) {
      vi.stubGlobal('window', {
        location: new URL(origin),
        zapDesktop: {
          platform: 'electron',
          analyticsProxyPath: '/__zap/analytics',
        },
      });
      expect(resolveAnalyticsApiUrl(API)).toBe(API);
    }
  });

  it('requires the bridge to advertise the analytics transport', () => {
    vi.stubGlobal('window', {
      location: new URL('http://127.0.0.1:3105'),
      zapDesktop: { platform: 'electron' },
    });
    expect(resolveAnalyticsApiUrl(API)).toBe(API);
  });
});
