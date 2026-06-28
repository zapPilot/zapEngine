/**
 * Container hook for the Activity screen. Connected users only see
 * analytics-derived events (daily yield returns + borrowing positions). The
 * lifecycle sample events remain a disconnected/demo fallback until a real
 * portfolio-events API exists.
 */
import { useQuery } from '@tanstack/react-query';
import { useBorrowingPositions } from '@zapengine/app-core/hooks/queries/analytics/useBorrowingPositions';
import {
  type BorrowingPosition,
  type DailyYieldReturnsResponse,
  getDailyYieldReturns,
} from '@zapengine/app-core/services';

import { type ActivityEvent, type ActivityGroup, DEMO } from '@/data/demo';

export interface ActivityData {
  groups: ActivityGroup[];
}

interface UseActivityDataResult {
  data: ActivityData | null;
  isLoading: boolean;
  isError: boolean;
}

const YIELD_DAYS = 30;

/** Group labels in render order; real events are merged into these buckets. */
const GROUP_ORDER = ['Today', 'This week', 'Earlier'] as const;
type GroupLabel = (typeof GROUP_ORDER)[number];

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Bucket an ISO date string into Today / This week / Earlier (best-effort). */
function bucketForDate(dateStr: string | undefined): GroupLabel {
  if (!dateStr) {
    return 'Earlier';
  }
  const ts = Date.parse(dateStr);
  if (Number.isNaN(ts)) {
    return 'Earlier';
  }
  const now = Date.now();
  const diffDays = Math.floor((now - ts) / MS_PER_DAY);
  if (diffDays <= 0) {
    return 'Today';
  }
  if (diffDays < 7) {
    return 'This week';
  }
  return 'Earlier';
}

/** Short, stable USD label (e.g. "+$24.10"); falls back to a dash. */
function usdLabel(value: number | undefined, signed = true): string {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '—';
  }
  const abs = Math.abs(value).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (!signed) {
    return `$${abs}`;
  }
  const sign = value < 0 ? '−' : '+';
  return `${sign}$${abs}`;
}

/** Compact weekday/date label from an ISO date (e.g. "Mon", "Jun 12"). */
function timeLabel(dateStr: string | undefined): string {
  if (!dateStr) {
    return '—';
  }
  const ts = Date.parse(dateStr);
  if (Number.isNaN(ts)) {
    return dateStr;
  }
  const d = new Date(ts);
  const diffDays = Math.floor((Date.now() - ts) / MS_PER_DAY);
  if (diffDays < 7) {
    return d.toLocaleDateString('en-US', { weekday: 'short' });
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** An event tagged with the time-bucket it should render in. */
interface BucketedEvent {
  bucket: GroupLabel;
  event: ActivityEvent;
}

/**
 * Roll up daily yield entries (one row per protocol/position/day) into one
 * `yield` ActivityEvent per (date, protocol) pair, summing the USD return.
 */
function yieldEventsFrom(
  resp: DailyYieldReturnsResponse | undefined,
): BucketedEvent[] {
  const rows = resp?.daily_returns ?? [];
  if (rows.length === 0) {
    return [];
  }

  const byKey = new Map<
    string,
    { date: string; protocol: string; chain: string; total: number }
  >();
  for (const row of rows) {
    const date = row?.date ?? '';
    const protocol = row?.protocol_name ?? 'DeFi yield';
    const chain = row?.chain ?? '';
    const key = `${date}::${protocol}`;
    const existing = byKey.get(key);
    const add =
      typeof row?.yield_return_usd === 'number' ? row.yield_return_usd : 0;
    if (existing) {
      existing.total += add;
    } else {
      byKey.set(key, { date, protocol, chain, total: add });
    }
  }

  return Array.from(byKey.values()).map((entry) => {
    const meta = entry.chain
      ? `${entry.protocol} · ${entry.chain}`
      : entry.protocol;
    return {
      bucket: bucketForDate(entry.date),
      event: {
        id: `yield-${entry.date}-${entry.protocol}`,
        kind: 'yield',
        title: 'Yield earned',
        amountLabel: usdLabel(entry.total),
        amountTone: entry.total < 0 ? 'negative' : 'positive',
        status: 'Settled',
        meta,
        time: timeLabel(entry.date),
      } satisfies ActivityEvent,
    };
  });
}

/**
 * Map borrowing positions to informational rows. There is no borrow-specific
 * activity kind in the screen, so we reuse `strategy-update` and surface each
 * position's current health, bucketed by its `updated_at`.
 */
function borrowingEventsFrom(
  positions: BorrowingPosition[] | undefined,
): BucketedEvent[] {
  const rows = positions ?? [];
  return rows.map((pos, index) => {
    const protocol = pos?.protocol_name ?? 'Borrowing';
    const chain = pos?.chain ?? '';
    const health = pos?.health_status ?? 'HEALTHY';
    const meta = chain
      ? `${protocol} · ${chain} · ${health}`
      : `${protocol} · ${health}`;
    return {
      bucket: bucketForDate(pos?.updated_at),
      event: {
        id: `borrow-${protocol}-${chain}-${index}`,
        kind: 'strategy-update',
        title: 'Borrowing position',
        amountLabel: usdLabel(pos?.net_value_usd, false),
        amountTone: 'neutral',
        status: 'Applied',
        meta,
        time: timeLabel(pos?.updated_at),
      } satisfies ActivityEvent,
    };
  });
}

/**
 * Merge demo + real events into the screen's `ActivityGroup[]`, preserving the
 * Today / This week / Earlier ordering. Real events are appended after the
 * demo events that already live in each bucket.
 */
function buildGroups(
  includeDemoEvents: boolean,
  yieldResp?: DailyYieldReturnsResponse,
  borrowing?: BorrowingPosition[],
): ActivityGroup[] {
  const buckets: Record<GroupLabel, ActivityEvent[]> = {
    Today: [],
    'This week': [],
    Earlier: [],
  };

  if (includeDemoEvents) {
    for (const group of DEMO.activity ?? []) {
      const label = group?.label as GroupLabel | undefined;
      if (label && label in buckets) {
        buckets[label].push(...(group?.events ?? []));
      }
    }
  }

  // Merge real yield + borrowing events into their respective buckets.
  for (const { bucket, event } of [
    ...yieldEventsFrom(yieldResp),
    ...borrowingEventsFrom(borrowing),
  ]) {
    buckets[bucket].push(event);
  }

  return GROUP_ORDER.map((label) => ({
    label,
    events: buckets[label],
  })).filter((group) => group.events.length > 0);
}

/**
 * Activity container hook. Calls the real yield service (via react-query) and
 * the borrowing-positions hook unconditionally; both are gated on `userId`.
 */
export function useActivityData(userId: string | null): UseActivityDataResult {
  const enabled = Boolean(userId);

  const yieldQuery = useQuery({
    queryKey: ['desktop', 'activity', 'dailyYield', userId, YIELD_DAYS],
    queryFn: () => getDailyYieldReturns(userId as string, YIELD_DAYS),
    enabled,
    staleTime: 5 * 60 * 1000,
  });

  const borrowingQuery = useBorrowingPositions(userId ?? undefined, enabled);

  const isLoading =
    enabled && (yieldQuery.isLoading || borrowingQuery.isLoading);
  const isError = yieldQuery.isError || borrowingQuery.isError;

  // While userId is unresolved, surface demo-only groups so the layout renders.
  if (!userId) {
    return {
      data: { groups: buildGroups(true) },
      isLoading: false,
      isError: false,
    };
  }

  return {
    data: {
      groups: buildGroups(
        false,
        yieldQuery.data,
        borrowingQuery.data?.positions,
      ),
    },
    isLoading,
    isError,
  };
}
