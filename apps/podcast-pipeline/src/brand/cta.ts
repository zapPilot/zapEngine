import { oneLiner, SLOGAN } from '@zapengine/zap-pilot-story/brand';

import type { LanguageClassroomLanguageCode } from '../types.js';

export const BRAND_CTA_VERSION = 'v1' as const;
export const ZAP_PILOT_SITE_URL = 'https://www.zap-pilot.org' as const;
export const ZAP_PILOT_SITE_LABEL = 'www.zap-pilot.org' as const;

const SOCIAL_BRAND_CTA_PREFIX_BY_LANGUAGE: Record<
  LanguageClassroomLanguageCode,
  string
> = {
  'zh-Hant': '官網',
  ja: '公式サイト',
  en: 'Website',
};

export function socialSignOff(
  languageCode: LanguageClassroomLanguageCode,
  destinationUrl: string = ZAP_PILOT_SITE_URL,
): string {
  return `${SLOGAN}\n${SOCIAL_BRAND_CTA_PREFIX_BY_LANGUAGE[languageCode]} ${destinationUrl}`;
}

export function socialLandingUrl(input: {
  episodeId: string;
  platform: string;
  languageCode: string;
}): string {
  const url = new URL(`${ZAP_PILOT_SITE_URL}/`);
  url.searchParams.set('utm_source', input.platform);
  url.searchParams.set('utm_medium', 'social');
  url.searchParams.set('utm_campaign', input.episodeId);
  url.searchParams.set('utm_content', input.languageCode);
  return url.toString();
}

export function appendBrandCta(
  text: string,
  languageCode: LanguageClassroomLanguageCode = 'zh-Hant',
  destinationUrl: string = ZAP_PILOT_SITE_URL,
): string {
  const body = text.trim();
  const cta = `${SOCIAL_BRAND_CTA_PREFIX_BY_LANGUAGE[languageCode]} ${destinationUrl}`;
  return body ? `${body}\n\n${cta}` : cta;
}

export function youtubeDescriptionCtaFor(
  destinationUrl: string = ZAP_PILOT_SITE_URL,
): string {
  return `${oneLiner()}\n${SLOGAN}\nWebsite: ${destinationUrl}`;
}

export function videoBrandOutro(): {
  title: string;
  callToAction: string;
} {
  return {
    title: SLOGAN,
    callToAction: ZAP_PILOT_SITE_LABEL,
  };
}
