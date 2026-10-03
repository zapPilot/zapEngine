export interface PackagingLane {
  platform: string;
  languageCode: string | null;
  samples: number;
}
export type PackagingCover =
  | { evidence: 'unverified' }
  | {
      evidence: 'shipped';
      thumbnailUrl: string | null;
      sha256: string | null;
      status: string | null;
      sourceImageUrl: string | null;
      fallbackReason: string | null;
    };
export interface PackagingEpisode {
  episodeId: string;
  publishedAt: string;
  shownTitle: string | null;
  canonicalTitle: string | null;
  views: number;
  reachLift: number;
  engagementRate: number | null;
  confirmations: Array<{
    platform: string;
    languageCode: string | null;
    reachLift: number;
  }>;
  cover: PackagingCover;
}
export interface PackagingFeature {
  key: 'title_has_number' | 'title_has_question' | 'title_longer_than_median';
  threshold: number | null;
  lift: number;
  with: { n: number; medianReachLift: number; engagementRate: number | null };
  without: {
    n: number;
    medianReachLift: number;
    engagementRate: number | null;
  };
}
export interface ContentPackagingInsight {
  status: 'available' | 'insufficient' | 'unavailable';
  message: string | null;
  basis: 'observational';
  lookbackDays: 60;
  window: '24h';
  primaryLane: PackagingLane & {
    suppressed: number;
    undistributed: number;
    undistributedRatio: number | null;
    distributed: number;
    medianViews: number | null;
    maxViews: number | null;
    engagementRate: number | null;
    insufficientBaseline: number;
  };
  confirmationLanes: PackagingLane[];
  rankedEpisodes: number;
  top: PackagingEpisode[];
  bottom: PackagingEpisode[];
  features: PackagingFeature[];
}
export function unavailableContentPackaging(
  message: string,
): ContentPackagingInsight {
  return {
    status: 'unavailable',
    message,
    basis: 'observational',
    lookbackDays: 60,
    window: '24h',
    primaryLane: {
      platform: 'rednote',
      languageCode: 'zh-Hant',
      samples: 0,
      suppressed: 0,
      undistributed: 0,
      undistributedRatio: null,
      distributed: 0,
      medianViews: null,
      maxViews: null,
      engagementRate: null,
      insufficientBaseline: 0,
    },
    confirmationLanes: [],
    rankedEpisodes: 0,
    top: [],
    bottom: [],
    features: [],
  };
}
