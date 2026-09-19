import type { SocialGrowthJourney } from './growth-journey.js';

export interface OperationsGrowthResponse {
  observedAt: string;
  status: 'available' | 'unknown';
  windowDays: 30;
  journey: SocialGrowthJourney;
  community: DiscordCommunitySummary;
  lanes: GrowthLaneFunnel[];
  laneSources: GrowthLaneSources;
}

export interface GrowthLaneFunnel {
  episodeId: string;
  platform: string;
  languageCode: string;
  title: string | null;
  publishedAt: string | null;
  postUrl: string | null;
  landingVisitors30d: number | null;
  ctaUsers30d: number | null;
  waitlistSignups: number | null;
  discordCtaUsers30d: number | null;
}

export type DiscordCommunitySummary =
  | {
      status: 'ok';
      message: null;
      inviteCode: string;
      guildId: string;
      guildName: string;
      memberCount: number;
      presenceCount: number | null;
      inviteExpiresAt: string | null;
      observedAt: string;
    }
  | {
      status: 'unavailable';
      message: string;
      inviteCode: string | null;
      guildId: null;
      guildName: null;
      memberCount: null;
      presenceCount: null;
      inviteExpiresAt: null;
      observedAt: string;
    };

export interface GrowthLaneSource {
  status: 'ok' | 'unavailable';
  message: string | null;
}
export interface GrowthLaneSources {
  posthog: GrowthLaneSource;
  socialPosts: GrowthLaneSource;
  waitlist: GrowthLaneSource;
}
export const GROWTH_LANE_CAP = 60;

export function unavailableDiscordCommunity(
  message: string,
  observedAt: string,
  inviteCode: string | null = null,
): DiscordCommunitySummary {
  return {
    status: 'unavailable',
    message,
    inviteCode,
    guildId: null,
    guildName: null,
    memberCount: null,
    presenceCount: null,
    inviteExpiresAt: null,
    observedAt,
  };
}

export function unavailableGrowthLaneSources(
  message: string,
): GrowthLaneSources {
  return {
    posthog: { status: 'unavailable', message },
    socialPosts: { status: 'unavailable', message },
    waitlist: { status: 'unavailable', message },
  };
}
