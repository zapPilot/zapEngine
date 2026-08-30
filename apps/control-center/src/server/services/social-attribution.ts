import type { SocialPlatformPerformance } from '../../shared/types.js';

export interface AttributionSnapshot {
  platform: string;
  captured_at: string;
  followers: number;
}

export interface AttributionPost {
  id: string;
  platform: string;
  published_at: string;
}

export interface AttributionObservation extends Pick<
  SocialPlatformPerformance,
  'likes' | 'comments' | 'shares' | 'saves'
> {
  social_post_id: string;
  captured_at: string;
  age_hours: number;
  measurement_window?: string | null;
  collection_status?: string | null;
  views: number | null;
  impressions: number | null;
  profile_visits: number | null;
  followers_gained: number | null;
}

export interface SnapshotInterval {
  platform: string;
  startAt: string;
  endAt: string;
  followersStart: number;
  followersEnd: number;
}

export interface PostActivity {
  postId: string;
  deltaReach: number | null;
  deltaEngagement: number | null;
  deltaProfileVisits: number | null;
}

export interface AttributionShare extends PostActivity {
  share: number;
  followersEstimated: number;
  basis: 'estimated';
}

export interface AttributedInterval extends SnapshotInterval {
  netDelta: number;
  unattributed: number;
  posts: AttributionShare[];
  basis: 'estimated';
}

export function pairSnapshotIntervals(
  snapshots: readonly AttributionSnapshot[],
): SnapshotInterval[] {
  const grouped = new Map<string, AttributionSnapshot[]>();
  for (const snapshot of snapshots) {
    if (!Number.isFinite(Date.parse(snapshot.captured_at))) {
      continue;
    }
    const rows = grouped.get(snapshot.platform) ?? [];
    rows.push(snapshot);
    grouped.set(snapshot.platform, rows);
  }
  return [...grouped.entries()].flatMap(([platform, rows]) => {
    const sorted = [...rows].sort(
      (left, right) =>
        Date.parse(left.captured_at) - Date.parse(right.captured_at),
    );
    return sorted.slice(1).flatMap((end, index) => {
      const start = sorted[index]!;
      if (Date.parse(end.captured_at) <= Date.parse(start.captured_at)) {
        return [];
      }
      return [
        {
          platform,
          startAt: start.captured_at,
          endAt: end.captured_at,
          followersStart: start.followers,
          followersEnd: end.followers,
        },
      ];
    });
  });
}

export function computePostActivity(input: {
  interval: SnapshotInterval;
  post: AttributionPost;
  observations: readonly AttributionObservation[];
}): PostActivity | null {
  const start = Date.parse(input.interval.startAt);
  const end = Date.parse(input.interval.endAt);
  const published = Date.parse(input.post.published_at);
  if (
    input.post.platform !== input.interval.platform ||
    !Number.isFinite(published) ||
    published > end
  ) {
    return null;
  }
  const observations = input.observations
    .filter(
      (row) =>
        row.social_post_id === input.post.id &&
        row.collection_status !== 'unavailable' &&
        Number.isFinite(Date.parse(row.captured_at)),
    )
    .sort(
      (left, right) =>
        Date.parse(left.captured_at) - Date.parse(right.captured_at),
    );
  const baseline = [...observations]
    .reverse()
    .find((row) => Date.parse(row.captured_at) <= start);
  const endpoint = [...observations].reverse().find((row) => {
    const captured = Date.parse(row.captured_at);
    return captured > start && captured <= end;
  });
  if (!endpoint) {
    return null;
  }
  if (!baseline && !(published > start && published <= end)) {
    return null;
  }

  return {
    postId: input.post.id,
    deltaReach: delta(baseline ? reach(baseline) : 0, reach(endpoint)),
    deltaEngagement: delta(
      baseline ? engagement(baseline) : 0,
      engagement(endpoint),
    ),
    deltaProfileVisits: delta(
      baseline ? baseline.profile_visits : 0,
      endpoint.profile_visits,
    ),
  };
}

export function attributeIntervalDelta(input: {
  interval: SnapshotInterval;
  activities: readonly PostActivity[];
}): AttributedInterval {
  const netDelta = input.interval.followersEnd - input.interval.followersStart;
  const active = input.activities.filter(
    (activity) =>
      (activity.deltaReach ?? 0) > 0 ||
      (activity.deltaEngagement ?? 0) > 0 ||
      (activity.deltaProfileVisits ?? 0) > 0,
  );
  if (netDelta <= 0 || active.length === 0) {
    return unattributedInterval(input.interval, netDelta);
  }
  if (active.length === 1) {
    return {
      ...input.interval,
      netDelta,
      unattributed: 0,
      posts: [share(active[0]!, 1, netDelta)],
      basis: 'estimated',
    };
  }

  const dimensions = [
    { key: 'deltaReach', weight: 0.5 },
    { key: 'deltaEngagement', weight: 0.3 },
    { key: 'deltaProfileVisits', weight: 0.2 },
  ] as const;
  const usable = dimensions.flatMap((dimension) => {
    const total = active.reduce(
      (sum, activity) => sum + Math.max(0, activity[dimension.key] ?? 0),
      0,
    );
    return total > 0 ? [{ ...dimension, total }] : [];
  });
  const weightTotal = usable.reduce(
    (sum, dimension) => sum + dimension.weight,
    0,
  );
  if (weightTotal === 0) {
    return unattributedInterval(input.interval, netDelta);
  }
  const posts = active.map((activity) => {
    const score = usable.reduce(
      (sum, dimension) =>
        sum +
        (dimension.weight / weightTotal) *
          (Math.max(0, activity[dimension.key] ?? 0) / dimension.total),
      0,
    );
    return share(activity, score, netDelta);
  });
  return {
    ...input.interval,
    netDelta,
    unattributed: Math.max(
      0,
      netDelta - posts.reduce((sum, post) => sum + post.followersEstimated, 0),
    ),
    posts,
    basis: 'estimated',
  };
}

function unattributedInterval(
  interval: SnapshotInterval,
  netDelta: number,
): AttributedInterval {
  return {
    ...interval,
    netDelta,
    unattributed: netDelta,
    posts: [],
    basis: 'estimated',
  };
}

export function buildFollowerAttribution(input: {
  snapshots: readonly AttributionSnapshot[];
  posts: readonly AttributionPost[];
  observations: readonly AttributionObservation[];
}): AttributedInterval[] {
  return pairSnapshotIntervals(input.snapshots).map((interval) =>
    attributeIntervalDelta({
      interval,
      activities: input.posts.flatMap((post) => {
        const activity = computePostActivity({
          interval,
          post,
          observations: input.observations,
        });
        return activity ? [activity] : [];
      }),
    }),
  );
}

export function exactYoutubeFollowersByPost(
  posts: readonly AttributionPost[],
  metrics: readonly AttributionObservation[],
): Map<string, number> {
  const youtubeIds = new Set(
    posts.filter((post) => post.platform === 'youtube').map((post) => post.id),
  );
  const latest = new Map<string, AttributionObservation>();
  for (const metric of metrics) {
    if (
      !youtubeIds.has(metric.social_post_id) ||
      metric.measurement_window === null ||
      metric.measurement_window === undefined ||
      metric.followers_gained === null
    ) {
      continue;
    }
    const previous = latest.get(metric.social_post_id);
    if (!previous || metric.age_hours > previous.age_hours) {
      latest.set(metric.social_post_id, metric);
    }
  }
  return new Map(
    [...latest.entries()].map(([postId, metric]) => [
      postId,
      metric.followers_gained!,
    ]),
  );
}

function reach(row: AttributionObservation): number | null {
  return row.views ?? row.impressions;
}

function engagement(row: AttributionObservation): number | null {
  const values = [row.likes, row.comments, row.shares, row.saves].filter(
    (value): value is number => value !== null,
  );
  return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
}

function delta(start: number | null, end: number | null): number | null {
  return start !== null && end !== null ? Math.max(0, end - start) : null;
}

function share(
  activity: PostActivity,
  value: number,
  netDelta: number,
): AttributionShare {
  return {
    ...activity,
    share: value,
    followersEstimated: netDelta * value,
    basis: 'estimated',
  };
}
