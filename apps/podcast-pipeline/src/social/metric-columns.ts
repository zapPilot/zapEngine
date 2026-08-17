import type { SocialPostMetricRow } from '../types.js';
import type { SocialMetricCounts } from './metrics.js';

export type SocialPostMetricColumns = Pick<
  SocialPostMetricRow,
  | 'views'
  | 'impressions'
  | 'likes'
  | 'comments'
  | 'shares'
  | 'saves'
  | 'profile_visits'
  | 'followers_gained'
>;

export function metricCountsToColumns(
  counts: SocialMetricCounts,
): SocialPostMetricColumns {
  return {
    views: counts.views,
    impressions: counts.impressions,
    likes: counts.likes,
    comments: counts.comments,
    shares: counts.shares,
    saves: counts.saves,
    profile_visits: counts.profileVisits,
    followers_gained: counts.followersGained,
  };
}

export function metricRowToCounts(
  row: SocialPostMetricRow,
): SocialMetricCounts {
  return {
    views: row.views,
    impressions: row.impressions,
    likes: row.likes,
    comments: row.comments,
    shares: row.shares,
    saves: row.saves,
    profileVisits: row.profile_visits,
    followersGained: row.followers_gained,
  };
}
