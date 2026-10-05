import type { CopyShape } from '../types';
import type * as Japanese from '../ja/site';
import { BEATS } from './beats';

export const SITE_URL = 'https://www.kokode.xyz';

/** Where the film sends viewers; the end card prints its host. */
export const FILM_LINK = `${SITE_URL}/?utm_source=film&utm_medium=video&utm_campaign=kokode-clinic#contact`;

export const SITE: CopyShape<typeof Japanese.SITE> = {
  name: 'KOKODE',
  skip: '跳至內容',
  home: 'KOKODE 首頁',
  navLabel: '主要導覽',
  howItWorks: '了解運作方式',
  sourceLead: '來源：',
  footerTagline: 'Private AI, here.',
  copyright: '© 2026 KOKODE',
  privacy: '隱私政策（日文）',
} as const;

/** Header links; hrefs are landing section ids (src/story/narrative.ts). */
export const NAV: CopyShape<typeof Japanese.NAV> = [
  { href: '#whyCloudHard', label: '課題' },
  { href: '#useCasePatient', label: '應用例' },
  { href: '#howItWorks', label: '運作方式' },
  { href: '#startSmall', label: '開始方式' },
] as const;

export const NAV_CTA: CopyShape<typeof Japanese.NAV_CTA> = {
  href: '#contact',
  label: '洽詢試行方案',
};

export type { PageId, PageMeta } from '../ja/site';
import type { PageId, PageMeta } from '../ja/site';

const tagline = BEATS.hero.title.join('');

export const META: { readonly [Id in PageId]: PageMeta } = {
  landing: {
    path: '/zh/',
    title: `KOKODE | ${tagline}`,
    description:
      '醫療機構專用的地端 AI，在院內網路中使用。從設備準備到設定，由 KOKODE 負責導入。先從一台設備、一項工作開始。',
    robots: 'index,follow',
  },
  pitch: {
    path: '/zh/pitch/',
    title: 'KOKODE | 醫療機構介紹資料',
    description: `${tagline} 醫療機構介紹資料。`,
    robots: 'noindex,nofollow',
    campaign: 'doctor-deck',
    deck: '醫療機構介紹資料',
  },
  partner: {
    path: '/zh/pitch/partner/',
    title: 'KOKODE | 銷售合作夥伴介紹資料',
    description: `${tagline} 銷售合作夥伴介紹資料。`,
    robots: 'noindex,nofollow',
    campaign: 'partner-deck',
    deck: '銷售合作夥伴介紹資料',
  },
};
