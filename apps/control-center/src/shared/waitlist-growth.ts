import type { SocialGrowthResponse } from './types.js';

export interface SocialWaitlistConversion {
  socialPublishJobId: string;
  episodeId: string;
  platform: string;
  languageCode: string;
  socialPostId: string | null;
  signups: number;
  views24h: number | null;
  signupRate: number | null;
}

export interface SocialWaitlistSummary {
  /** Exact table count when Supabase can provide one. */
  total: number | null;
  signups7d: number;
  attributedSocial7d: number;
  directOrUnknown7d: number;
  conversions: SocialWaitlistConversion[];
}

export type SocialGrowthWithWaitlistResponse = SocialGrowthResponse & {
  waitlist: SocialWaitlistSummary;
};
