import { coerceToSupportedLanguage } from '../services/podcast/classroom-language.js';
import type { LanguageClassroomLanguageCode } from '../types.js';

export const BRAND_CTA_VERSION = 'v1' as const;
export const ZAP_PILOT_SITE_URL = 'https://www.zap-pilot.org' as const;
export const ZAP_PILOT_SITE_LABEL = 'www.zap-pilot.org' as const;

// Two CJK characters + one space cost five weighted X units. Together with the
// two separator newlines and X's fixed 23-unit URL weight, this keeps the old
// 250-unit generated-copy budget intact while making the destination explicit.
export const SOCIAL_BRAND_CTA = `官網 ${ZAP_PILOT_SITE_URL}` as const;

// YouTube descriptions have no character pressure, so they close with a full
// sentence instead of the short suffix above. Both strings live here so the
// destination can never drift between surfaces.
export const YOUTUBE_DESCRIPTION_CTA =
  `更多市場洞察與工具：${ZAP_PILOT_SITE_URL}` as const;

const VIDEO_CTA_TITLES: Record<LanguageClassroomLanguageCode, string> = {
  'zh-Hant': '更多市場洞察與工具',
  ja: '市場インサイトとツールをもっと',
  en: 'MORE MARKET INSIGHTS & TOOLS',
};

export function appendBrandCta(text: string): string {
  const body = text.trim();
  return body ? `${body}\n\n${SOCIAL_BRAND_CTA}` : SOCIAL_BRAND_CTA;
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
