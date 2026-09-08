import { coerceToSupportedLanguage } from '../services/podcast/classroom-language.js';
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

// Two CJK characters + one space cost five weighted X units. Together with the
// two separator newlines and X's fixed 23-unit URL weight, this keeps the old
// 250-unit generated-copy budget intact while making the destination explicit.
export const SOCIAL_BRAND_CTA_BY_LANGUAGE: Record<
  LanguageClassroomLanguageCode,
  string
> = {
  'zh-Hant': `官網 ${ZAP_PILOT_SITE_URL}`,
  ja: `公式サイト ${ZAP_PILOT_SITE_URL}`,
  en: `Website ${ZAP_PILOT_SITE_URL}`,
};

const YOUTUBE_DESCRIPTION_CTA_PREFIX_BY_LANGUAGE: Record<
  LanguageClassroomLanguageCode,
  string
> = {
  'zh-Hant': '更多市場洞察與工具：',
  ja: '市場インサイトとツールをもっと：',
  en: 'More market insights and tools: ',
};

const VIDEO_CTA_TITLES: Record<LanguageClassroomLanguageCode, string> = {
  'zh-Hant': '更多市場洞察與工具',
  ja: '市場インサイトとツールをもっと',
  en: 'MORE MARKET INSIGHTS & TOOLS',
};

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
  languageCode: LanguageClassroomLanguageCode,
  destinationUrl: string = ZAP_PILOT_SITE_URL,
): string {
  return `${YOUTUBE_DESCRIPTION_CTA_PREFIX_BY_LANGUAGE[languageCode]}${destinationUrl}`;
}

export function videoBrandCtaFor(languageCode: string): {
  title: string;
  callToAction: string;
} {
  return {
    title: VIDEO_CTA_TITLES[coerceToSupportedLanguage(languageCode)],
    callToAction: ZAP_PILOT_SITE_LABEL,
  };
}
