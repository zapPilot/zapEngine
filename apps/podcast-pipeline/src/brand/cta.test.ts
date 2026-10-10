import { describe, expect, it } from 'vitest';

import {
  appendBrandCta,
  BRAND_CTA_VERSION,
  socialLandingUrl,
  videoBrandOutro,
  ZAP_PILOT_SITE_LABEL,
  ZAP_PILOT_SITE_URL,
} from './cta.js';

describe('Zap Pilot brand CTA', () => {
  it('keeps a versioned canonical destination for every social surface', () => {
    expect(BRAND_CTA_VERSION).toBe('v1');
    expect(ZAP_PILOT_SITE_URL).toBe('https://www.zap-pilot.org');
    expect(ZAP_PILOT_SITE_LABEL).toBe('www.zap-pilot.org');
    expect(appendBrandCta('市場更新')).toBe(
      '市場更新\n\n官網 https://www.zap-pilot.org',
    );
    expect(appendBrandCta('   ')).toBe('官網 https://www.zap-pilot.org');
  });

  it('builds a deterministic release attribution URL without inventing another identity', () => {
    expect(
      socialLandingUrl({
        episodeId: '72f1ee5b-3f57-4e32-b7ad-fe57666985d6',
        platform: 'youtube',
        languageCode: 'en',
      }),
    ).toBe(
      'https://www.zap-pilot.org/?utm_source=youtube&utm_medium=social&utm_campaign=72f1ee5b-3f57-4e32-b7ad-fe57666985d6&utm_content=en',
    );
  });

  it('uses the canonical slogan as the video headline on the same destination', () => {
    expect(videoBrandOutro()).toEqual({
      title: 'Your strategy. Your machine. Your wallet.',
      callToAction: 'www.zap-pilot.org',
    });
  });
});
