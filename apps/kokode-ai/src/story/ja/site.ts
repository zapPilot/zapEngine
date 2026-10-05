import { BEATS } from './beats';

export const SITE_URL = 'https://www.kokode.xyz';

/** Where the film sends viewers; the end card prints its host. */
export const FILM_LINK = `${SITE_URL}/?utm_source=film&utm_medium=video&utm_campaign=kokode-clinic#contact`;

export const SITE = {
  name: 'KOKODE',
  skip: '本文へスキップ',
  home: 'KOKODE ホーム',
  navLabel: 'メインナビゲーション',
  howItWorks: 'しくみを見る',
  sourceLead: '出典：',
  footerTagline: 'Private AI, here.',
  copyright: '© 2026 KOKODE',
  privacy: 'プライバシーポリシー',
} as const;

/** Header links; hrefs are landing section ids (src/story/narrative.ts). */
export const NAV = [
  { href: '#whyCloudHard', label: '課題' },
  { href: '#useCasePatient', label: '活用例' },
  { href: '#howItWorks', label: 'しくみ' },
  { href: '#startSmall', label: 'はじめ方' },
] as const;

export const NAV_CTA = { href: '#contact', label: 'パイロットを相談する' };

export type PageId = 'landing' | 'pitch' | 'partner';

export interface PageMeta {
  /** Path below SITE_URL; also the canonical URL. */
  readonly path: string;
  readonly title: string;
  readonly description: string;
  readonly robots: string;
  /** Campaign recorded by the deck's contact links. */
  readonly campaign?: string;
  /** Deck name printed on every slide. */
  readonly deck?: string;
}

const tagline = BEATS.hero.title.join('');

export const META: { readonly [Id in PageId]: PageMeta } = {
  landing: {
    path: '/',
    title: `KOKODE | ${tagline}`,
    description:
      '医療機関のためのオンプレミスAI。院内のネットワークの中だけで使え、機器の準備から設定までKOKODEが導入します。まずは1台、1つの業務から。',
    robots: 'index,follow',
  },
  pitch: {
    path: '/pitch/',
    title: 'KOKODE | 医療機関向けご紹介資料',
    description: `${tagline}医療機関向けのご紹介資料です。`,
    robots: 'noindex,nofollow',
    campaign: 'doctor-deck',
    deck: '医療機関向けご紹介資料',
  },
  partner: {
    path: '/pitch/partner/',
    title: 'KOKODE | 販売パートナー向けご紹介資料',
    description: `${tagline}販売パートナー向けのご紹介資料です。`,
    robots: 'noindex,nofollow',
    campaign: 'partner-deck',
    deck: '販売パートナー向けご紹介資料',
  },
};
