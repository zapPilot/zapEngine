/**
 * Formats the strategy-change Telegram broadcast from the committed equity
 * curve. Pure: no I/O, no config, no logging.
 *
 * The notification describes the *strategy*, not a user's portfolio — the same
 * text goes to everyone — so everything here is read off the same artifact the
 * /track-record chart draws.
 *
 * Telegram legacy Markdown is the parse mode, so `_` may only appear inside
 * backticks. Every label below is plain prose and the slug fallback replaces
 * underscores with spaces, which is what keeps that true.
 */

import { formatUsdAmount, humanizeSlug } from './message-format.util';
import { CurveEvent, EquityCurveSubset } from './track-record/schema';

/**
 * Column order of `allocations.values` rows, as labels. Positional because the
 * rows carry no keys — the schema pins the header to btc/eth/spy/stable.
 */
const ALLOCATION_LABELS = ['BTC', 'ETH', 'SPY', 'Cash'] as const;

/**
 * Weights below this render as "0.0%", which reads as a bug rather than as a
 * residual position, so they are dropped instead.
 */
const MIN_DISPLAYED_PERCENT = 0.05;

/**
 * One short sentence per rule slug the backtest can emit (the `reason` field of
 * an equity-curve event). Anything unrecognised falls back to the slug itself
 * spelled out, so a new rule degrades to readable rather than to silence.
 */
const REASON_LABELS: Record<string, string> = {
  portfolio_cross_down_exit:
    'The asset closed below its long-term average, so the position was exited to stables.',
  portfolio_cross_up_equal_weight:
    'A cross back above the long-term average put the eligible risk assets at equal weight.',
  portfolio_dma_overextension_dca_sell:
    'Price ran far above its long-term average, so the strategy trimmed on a schedule.',
  portfolio_eth_btc_deviation_dca_to_btc:
    'The ETH/BTC ratio sat well away from its average, so part of the pair mean-reverted into BTC.',
  portfolio_eth_btc_deviation_dca_to_eth:
    'The ETH/BTC ratio sat well away from its average, so part of the pair mean-reverted into ETH.',
  portfolio_eth_btc_deviation_large_to_btc:
    'The ETH/BTC ratio was stretched far enough to rotate most of the pair into BTC.',
  portfolio_eth_btc_deviation_large_to_eth:
    'The ETH/BTC ratio was stretched far enough to rotate most of the pair into ETH.',
  portfolio_eth_btc_ratio_rotation_to_btc:
    'The ETH/BTC ratio crossed below its average, rotating the pair into BTC.',
  portfolio_eth_btc_ratio_rotation_to_eth:
    'The ETH/BTC ratio crossed above its average, rotating the pair into ETH.',
  portfolio_fgi_downshift_dca_sell:
    'Market sentiment fell out of greed, so risk was trimmed with a scheduled sell.',
};

/**
 * The trade events this run should announce.
 *
 * With no stored cursor the artifact's whole history is new, so the first run
 * anchors on the window's last day rather than replaying every past trade into
 * everyone's chat.
 */
export function selectNewEvents(
  curve: EquityCurveSubset,
  lastNotifiedEventDate: string | null,
): CurveEvent[] {
  const chronological = [...curve.events].sort((a, b) =>
    a.date.localeCompare(b.date),
  );

  if (lastNotifiedEventDate === null) {
    return chronological.filter((event) => event.date === curve.window.end);
  }

  // ISO dates compare correctly as strings, which is also how they are stored.
  return chronological.filter((event) => event.date > lastNotifiedEventDate);
}

/** The newest event date in the artifact, or null when it records no trades. */
export function latestEventDate(curve: EquityCurveSubset): string | null {
  return curve.events.reduce<string | null>(
    (latest, event) =>
      latest === null || event.date > latest ? event.date : latest,
    null,
  );
}

export function buildStrategyChangeMessage(
  curve: EquityCurveSubset,
  events: readonly CurveEvent[],
): string {
  if (events.length === 0) {
    throw new Error('buildStrategyChangeMessage requires at least one event');
  }

  const chronological = [...events].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  const first = chronological[0]!;
  const last = chronological[chronological.length - 1]!;

  // series[0] is the strategy curve — the same series the chart draws and the
  // series allocation rows are positional against.
  const points = curve.series[0]!.values;
  const indexByDate = new Map(
    points.map((point, index) => [point.date, index]),
  );
  const firstIndex = indexByDate.get(first.date);
  const lastIndex = indexByDate.get(last.date);

  const blocks = [
    header(chronological.length, last.date),
    ...chronological.map((event) =>
      eventBlock(event, chronological.length > 1),
    ),
  ];

  const allocations = allocationBlock(curve, firstIndex, lastIndex);
  if (allocations !== null) {
    blocks.push(allocations);
  }

  blocks.push(
    footer(curve, lastIndex === undefined ? null : points[lastIndex]!.value),
  );

  return blocks.join('\n\n');
}

function header(eventCount: number, lastDate: string): string {
  return eventCount === 1
    ? `📈 *Strategy Update — ${lastDate}*`
    : `📈 *Strategy Update — ${eventCount} trades through ${lastDate}*`;
}

/**
 * A single-event message needs no date on the action line — the header carries
 * it. A catch-up message does, because the trades are on different days.
 */
function eventBlock(event: CurveEvent, withDate: boolean): string {
  const action = [
    ...(withDate ? [event.date] : []),
    actionSentence(event),
    `${formatUsdAmount(event.amountUsd)} (${event.amountPercent.toFixed(1)}% of portfolio)`,
  ].join(' — ');

  return `${action}\nWhy: ${humanizeReason(event.reason)}`;
}

/**
 * Same phrasing as the chart's marker tooltip (landing-page chartEvents.ts), so
 * a reader who saw the notification recognises the marker.
 *
 * The trailing branches cover an event type this formatter does not know: the
 * schema keeps `type` an open string on purpose, and "Rebalanced" is truthful
 * for anything the strategy adds later.
 */
function actionSentence(event: CurveEvent): string {
  const sold = event.fromAssets.join(', ');

  if (event.type === 'sell') {
    return sold ? `Sold ${sold}` : 'Sold into stables';
  }
  if (event.type === 'buy') {
    return event.toAsset ? `Bought ${event.toAsset}` : 'Bought into the market';
  }
  if (event.toAsset) {
    return sold
      ? `Rotated ${sold} into ${event.toAsset}`
      : `Rotated into ${event.toAsset}`;
  }
  return sold ? `Rotated out of ${sold}` : 'Rebalanced';
}

function humanizeReason(reason: string): string {
  const mapped = REASON_LABELS[reason];
  if (mapped) {
    return mapped;
  }
  return `${humanizeSlug(reason)}.`;
}

/**
 * One before/after pair for the whole message: the book as it stood the day
 * before the first trade, and as it stands after the last one. A trade on day
 * zero has nothing before it, so "Before" is omitted rather than invented.
 *
 * Null when the artifact's series does not contain the last trade's date — the
 * position it would describe cannot be established.
 */
function allocationBlock(
  curve: EquityCurveSubset,
  firstIndex: number | undefined,
  lastIndex: number | undefined,
): string | null {
  if (lastIndex === undefined) return null;

  // In range by construction: the schema holds allocations.values to one row
  // per strategy series point, and lastIndex came from that same series.
  const after = curve.allocations.values[lastIndex]!;

  const before =
    firstIndex !== undefined && firstIndex > 0
      ? curve.allocations.values[firstIndex - 1]
      : undefined;

  return [
    ...(before ? [`Before: ${formatAllocationRow(before)}`] : []),
    `After: ${formatAllocationRow(after)}`,
  ].join('\n');
}

function formatAllocationRow(row: readonly number[]): string {
  return row
    .map((weight, index) => ({
      label: ALLOCATION_LABELS[index]!,
      percent: weight * 100,
    }))
    .filter((entry) => entry.percent >= MIN_DISPLAYED_PERCENT)
    .map((entry) => `${entry.label} ${entry.percent.toFixed(1)}%`)
    .join(' · ');
}

function footer(curve: EquityCurveSubset, navValue: number | null): string {
  return [
    ...(navValue === null
      ? []
      : [`NAV index: ${navValue.toFixed(2)} (window start = 100)`]),
    // Backticked: the strategy id carries underscores, which legacy Markdown
    // would otherwise read as italics.
    `Strategy: \`${curve.eventsMeta.strategyId}\``,
  ].join('\n');
}
