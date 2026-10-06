import type { CopyShape } from '../types.js';
import type * as Japanese from '../ja/site.js';
import { BEATS } from './beats.js';

export const SITE_URL = 'https://www.kokode.xyz';

/** Where the film sends viewers; the end card prints its host. */
export const FILM_LINK = `${SITE_URL}/?utm_source=film&utm_medium=video&utm_campaign=kokode-clinic#contact`;

export const SITE: CopyShape<typeof Japanese.SITE> = {
  name: 'KOKODE',
  skip: 'Skip to content',
  home: 'KOKODE home',
  navLabel: 'Main navigation',
  howItWorks: 'See how it works',
  sourceLead: 'Source:',
  footerTagline: 'Private AI, here.',
  copyright: '© 2026 KOKODE',
  privacy: 'Privacy policy (Japanese)',
} as const;

/** Header links; hrefs are landing section ids (packages/kokode-story/src/narrative.ts). */
export const NAV: CopyShape<typeof Japanese.NAV> = [
  { href: '#whyCloudHard', label: 'Challenges' },
  { href: '#useCasePatient', label: 'Examples' },
  { href: '#howItWorks', label: 'How it works' },
  { href: '#startSmall', label: 'Get started' },
] as const;

export const NAV_CTA: CopyShape<typeof Japanese.NAV_CTA> = {
  href: '#contact',
  label: 'Discuss a pilot',
};

export type { PageId, PageMeta } from '../ja/site.js';
import type { PageId, PageMeta } from '../ja/site.js';

const tagline = BEATS.hero.title.join(' ');

export const META: { readonly [Id in PageId]: PageMeta } = {
  landing: {
    path: '/en/',
    title: `KOKODE | ${tagline}`,
    description:
      'AI runs inside your medical facility. Everyday use needs no internet. Sign in on an authorized facility network. KOKODE sets it up before delivery. Start with one device and one workflow.',
    robots: 'index,follow',
  },
  pitch: {
    path: '/en/pitch/',
    title: 'KOKODE | Introduction for medical facilities',
    description: `${tagline} Introduction for medical facilities.`,
    robots: 'noindex,nofollow',
    campaign: 'doctor-deck',
    deck: 'Introduction for medical facilities',
  },
  partner: {
    path: '/en/pitch/partner/',
    title: 'KOKODE | Introduction for sales partners',
    description: `${tagline} Introduction for sales partners.`,
    robots: 'noindex,nofollow',
    campaign: 'partner-deck',
    deck: 'Introduction for sales partners',
  },
};
