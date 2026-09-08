import { describe, expect, it } from 'vitest';

import {
  appendBrandCta,
  BRAND_CTA_VERSION,
  socialLandingUrl,
  videoBrandCtaFor,
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

  it('localizes the video headline while preserving the same destination', () => {
    expect(videoBrandCtaFor('zh-Hant')).toEqual({
      title: '更多市場洞察與工具',
      callToAction: 'www.zap-pilot.org',
    });
    expect(videoBrandCtaFor('ja').callToAction).toBe('www.zap-pilot.org');
    expect(videoBrandCtaFor('en').callToAction).toBe('www.zap-pilot.org');
  });
});
