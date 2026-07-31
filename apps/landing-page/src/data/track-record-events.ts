/**
 * Buy / sell / rotation events for the track-record NAV chart.
 *
 * Two sources, one shape. The demo path reads events the backtest actually
 * produced — `scripts/landing/events.py` derives them from the same compare
 * run that produces equity-curve.json, so a marker lands on the day the
 * strategy really traded. The live path derives the same events from published
 * snapshots, so switching `latestSnapshotCid` on does not silently drop the
 * markers.
 *
 * These types stay local to landing-page on purpose. `DailySnapshotSchema` in
 * @zapengine/types is a signed, stored contract — the nightly snapshot cron
 * signs over its canonical form — so adding backtest-only fields there would
 * invalidate published CIDs. equity-curve.json is a build-time input, neither
 * over the wire nor stored.
 */
import type { DailySnapshot } from '@zapengine/types/strategy';
import equityCurveRaw from '@/data/equity-curve.json';
import { hasRebalance } from '@/components/track-record/rebalance';

export type StrategyEventType =
  | 'buy'
  | 'sell'
  | 'rotate_to_btc'
  | 'rotate_to_eth'
  | 'rotate_to_spy';

export type StrategyEventAsset = 'BTC' | 'ETH' | 'SPY';

export type StrategyEventAction = 'buy' | 'sell' | 'rotate';

export interface StrategyEvent {
  readonly date: string;
  readonly type: StrategyEventType;
  readonly toAsset: StrategyEventAsset | null;
  readonly fromAssets: readonly string[];
  /**
   * The indexed series value the backtest recorded for this date. The chart
   * does not place markers with it — it joins by date against its own series,
   * so a marker is on the curve by construction — but it lets a data test
   * catch an artifact whose events and series disagree.
   */
  readonly indexedValue?: number;
  /**
   * Gross USD moved on the day. Backtest-only: a published snapshot records
   * position weights, not fills, so the live path leaves this unset rather than
   * inventing a number from a weight delta.
   */
  readonly amountUsd?: number;
  /**
   * That gross as a share of the day's portfolio, which is what makes a trade
   * legible — $10k means nothing without the book it moved within.
   */
  readonly amountPercent?: number;
  readonly reason: string;
}

const ROTATION_TYPE: Record<StrategyEventAsset, StrategyEventType> = {
  BTC: 'rotate_to_btc',
  ETH: 'rotate_to_eth',
  SPY: 'rotate_to_spy',
};

/** Ties break in this order, so an equal fan-out names the same destination. */
const RISK_ASSETS: readonly StrategyEventAsset[] = ['BTC', 'ETH', 'SPY'];

const EVENT_TYPES = new Set<string>([
  'buy',
  'sell',
  ...Object.values(ROTATION_TYPE),
]);

/** Weight moves below this many percentage points are drift, not a decision. */
const MIN_WEIGHT_DELTA_PP = 0.5;

export function eventAction(event: StrategyEvent): StrategyEventAction {
  if (event.type === 'buy' || event.type === 'sell') return event.type;
  return 'rotate';
}

/**
 * The asset a marker is coloured by: what was bought or rotated into, or —
 * for a sell, which has no destination — the largest position sold out of.
 */
export function eventAsset(event: StrategyEvent): StrategyEventAsset | null {
  if (event.toAsset) return event.toAsset;
  const sold = event.fromAssets.find((asset): asset is StrategyEventAsset =>
    RISK_ASSETS.includes(asset as StrategyEventAsset),
  );
  return sold ?? null;
}

function isEventType(value: string): value is StrategyEventType {
  return EVENT_TYPES.has(value);
}

function toEventAsset(value: string | null): StrategyEventAsset | null {
  return RISK_ASSETS.includes(value as StrategyEventAsset)
    ? (value as StrategyEventAsset)
    : null;
}

/** Events the backtest recorded, for the demo dataset. */
export function demoStrategyEvents(): StrategyEvent[] {
  const raw = (equityCurveRaw as { events?: unknown }).events;
  if (!Array.isArray(raw)) return [];

  return raw.flatMap((entry): StrategyEvent[] => {
    const event = entry as Record<string, unknown>;
    const date = event['date'];
    const type = event['type'];
    if (typeof date !== 'string' || typeof type !== 'string') return [];
    if (!isEventType(type)) return [];

    const fromAssets = Array.isArray(event['fromAssets'])
      ? event['fromAssets'].filter(
          (asset): asset is string => typeof asset === 'string',
        )
      : [];

    return [
      {
        date,
        type,
        toAsset: toEventAsset(
          typeof event['toAsset'] === 'string' ? event['toAsset'] : null,
        ),
        fromAssets,
        ...numberField(event, 'indexedValue'),
        ...numberField(event, 'amountUsd'),
        ...numberField(event, 'amountPercent'),
        reason: typeof event['reason'] === 'string' ? event['reason'] : '',
      },
    ];
  });
}

/** Spread-or-omit, so a malformed artifact leaves the field absent rather than NaN. */
function numberField<K extends string>(
  event: Record<string, unknown>,
  key: K,
): Record<K, number> | Record<string, never> {
  const value = event[key];
  return typeof value === 'number' && Number.isFinite(value)
    ? ({ [key]: value } as Record<K, number>)
    : {};
}

/** Dates the backtest traded on, so the demo snapshots can agree with the chart. */
export function demoStrategyEventDates(): ReadonlySet<string> {
  return new Set(demoStrategyEvents().map((event) => event.date));
}

/** Position weights folded to one entry per asset, in percentage points. */
export function weightsByAsset(snapshot: DailySnapshot): Map<string, number> {
  const weights = new Map<string, number>();
  for (const position of snapshot.positions) {
    const weight = Number.parseFloat(position.weight);
    if (!Number.isFinite(weight)) continue;
    weights.set(position.asset, (weights.get(position.asset) ?? 0) + weight);
  }
  return weights;
}

function riskDeltas(
  previous: DailySnapshot,
  current: DailySnapshot,
): Map<StrategyEventAsset, number> {
  const before = weightsByAsset(previous);
  const after = weightsByAsset(current);
  const deltas = new Map<StrategyEventAsset, number>();
  for (const asset of RISK_ASSETS) {
    const delta = (after.get(asset) ?? 0) - (before.get(asset) ?? 0);
    if (Math.abs(delta) >= MIN_WEIGHT_DELTA_PP) deltas.set(asset, delta);
  }
  return deltas;
}

/**
 * Same three rules as the Python derivation, in percentage points instead of
 * USD: risk both in and out is a rotation; otherwise the sign of the net risk
 * change says whether cash was deployed or raised. Nothing enumerates stable
 * symbols — a portfolio whose weights sum to 100 makes that redundant.
 *
 * `amountPercent` comes out of the same two sums, which is why measuring lives
 * here rather than in a second pass: the larger side is the gross that moved,
 * since the stable leg closes whichever side is short. It approximates the
 * artifact's USD figure and inherits this path's existing caveat — weights are
 * end-of-day, so a delta blends trading with price drift.
 */
function classify(
  deltas: Map<StrategyEventAsset, number>,
): Pick<
  StrategyEvent,
  'type' | 'toAsset' | 'fromAssets' | 'amountPercent'
> | null {
  let riskIn = 0;
  let riskOut = 0;
  for (const delta of deltas.values()) {
    if (delta > 0) riskIn += delta;
    else riskOut -= delta;
  }
  if (riskIn === 0 && riskOut === 0) return null;

  const gained = RISK_ASSETS.filter((asset) => (deltas.get(asset) ?? 0) > 0);
  const target =
    gained.length > 0
      ? gained.reduce((best, asset) =>
          (deltas.get(asset) ?? 0) > (deltas.get(best) ?? 0) ? asset : best,
        )
      : null;
  const fromAssets = RISK_ASSETS.filter(
    (asset) => (deltas.get(asset) ?? 0) < 0,
  ).sort((a, b) => (deltas.get(a) ?? 0) - (deltas.get(b) ?? 0));
  const amountPercent = Math.round(Math.max(riskIn, riskOut) * 10) / 10;

  if (riskIn > 0 && riskOut > 0) {
    if (target === null) return null;
    return {
      type: ROTATION_TYPE[target],
      toAsset: target,
      fromAssets,
      amountPercent,
    };
  }
  if (riskIn > riskOut) {
    return { type: 'buy', toAsset: target, fromAssets: [], amountPercent };
  }
  return { type: 'sell', toAsset: null, fromAssets, amountPercent };
}

/** Events derived from published snapshots, for the live path. */
export function deriveEventsFromSnapshots(
  snapshots: readonly DailySnapshot[],
): StrategyEvent[] {
  const events: StrategyEvent[] = [];
  for (let index = 1; index < snapshots.length; index += 1) {
    const snapshot = snapshots[index]!;
    if (!hasRebalance(snapshot)) continue;
    const classified = classify(riskDeltas(snapshots[index - 1]!, snapshot));
    if (classified === null) continue;
    events.push({ date: snapshot.date, ...classified, reason: 'Rebalance' });
  }
  return events;
}
