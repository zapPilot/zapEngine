export const BRAND_CTA_VERSION = 'v1' as const;
export const ZAP_PILOT_SITE_URL = 'https://www.zap-pilot.org' as const;
export const ZAP_PILOT_SITE_LABEL = 'www.zap-pilot.org' as const;

// Two CJK characters + one space cost five weighted X units. Together with the
// two separator newlines and X's fixed 23-unit URL weight, this keeps the old
// 250-unit generated-copy budget intact while making the destination explicit.
export const SOCIAL_BRAND_CTA = `官網 ${ZAP_PILOT_SITE_URL}` as const;

const VIDEO_CTA_TITLES: Record<'zh-Hant' | 'ja' | 'en', string> = {
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
  const language =
    languageCode === 'zh-Hant' || languageCode === 'ja' ? languageCode : 'en';
  return {
    title: VIDEO_CTA_TITLES[language],
    callToAction: ZAP_PILOT_SITE_LABEL,
  };
}
