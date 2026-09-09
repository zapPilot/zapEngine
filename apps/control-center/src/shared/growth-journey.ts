/**
 * Cross-source acquisition read for the Growth journey. PostHog counts unique
 * people; durable waitlist rows remain owned by Supabase. The UI must not
 * present the two as a person-level join until a shared identity exists.
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
