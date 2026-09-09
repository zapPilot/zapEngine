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

/**
 * Cross-source acquisition read for the Growth journey. PostHog counts unique
 * people; durable waitlist rows remain owned by Supabase. Keeping this beside
 * the waitlist summary makes the source boundary explicit instead of inventing
 * a person-level join the repository does not have.
 */
export type SocialGrowthJourney =
  | {
      status: 'ok';
      message: null;
      landingVisitors30d: number;
      ctaUsers30d: number;
      appVisitors30d: number;
      walletConnectedUsers30d: number;
      landingThreads30d: number;
      landingX30d: number;
      landingYoutube30d: number;
      landingRednote30d: number;
      landingDirect30d: number;
      landingOther30d: number;
    }
  | {
      status: 'unavailable';
      message: string;
      landingVisitors30d: null;
      ctaUsers30d: null;
      appVisitors30d: null;
      walletConnectedUsers30d: null;
      landingThreads30d: null;
      landingX30d: null;
      landingYoutube30d: null;
      landingRednote30d: null;
      landingDirect30d: null;
      landingOther30d: null;
    };

export type SocialWaitlistSummary =
  | {
      status: 'ok';
      message: string | null;
      total: number;
      signups7d: number;
      signups30d: number;
      attributedSocial7d: number;
      directOrUnknown7d: number;
      conversions: SocialWaitlistConversion[];
      journey?: SocialGrowthJourney;
    }
  | {
      status: 'unavailable';
      message: string;
      total: null;
      signups7d: null;
      signups30d: null;
      attributedSocial7d: null;
      directOrUnknown7d: null;
      conversions: [];
      journey?: SocialGrowthJourney;
    };

export function unavailableWaitlist(message: string): SocialWaitlistSummary {
  return {
    status: 'unavailable',
    message,
    total: null,
    signups7d: null,
    signups30d: null,
    attributedSocial7d: null,
    directOrUnknown7d: null,
    conversions: [],
  };
}
