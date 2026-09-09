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
