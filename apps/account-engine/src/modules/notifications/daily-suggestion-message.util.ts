import { REGIME_EMOJI } from '../../common/constants';
import type { DailySuggestionSubset } from './analytics-client/daily-suggestion.schema';
import { formatUsdAmount, humanizeSlug } from './message-format.util';

export const DAILY_SUGGESTION_DONE_PREFIX = 'dsdone';

export interface TelegramMessagePayload {
  message: string;
  replyMarkup?: {
    inline_keyboard: { text: string; callback_data: string }[][];
  };
}

const ALLOCATION_ORDER = ['btc', 'eth', 'spy', 'stable'] as const;
const ALLOCATION_LABELS: Readonly<Record<string, string>> = {
  btc: 'BTC',
  eth: 'ETH',
  spy: 'SPY',
  stable: 'Cash',
  cash: 'Cash',
};
const MIN_DISPLAYED_PERCENT = 0.05;

export function encodeDailySuggestionDoneCallbackData(
  configId: string,
  strategyId: string,
): string {
  return [DAILY_SUGGESTION_DONE_PREFIX, configId, strategyId].join('|');
}

export function parseDailySuggestionDoneCallbackData(
  callbackData: string,
): { configId: string; strategyId: string } | null {
  const [prefix, configId, strategyId, ...rest] = callbackData.split('|');
  if (
    prefix !== DAILY_SUGGESTION_DONE_PREFIX ||
    !configId ||
    !strategyId ||
    rest.length > 0
  ) {
    return null;
  }
  return { configId, strategyId };
}

export function buildDecisionPacketMessage(
  data: DailySuggestionSubset,
): TelegramMessagePayload {
  const message = formatDecisionPacketMessage(data);
  const callbackData = encodeDailySuggestionDoneCallbackData(
    data.config_id,
    data.strategy_id,
  );

  if (data.action.status !== 'action_required' || callbackData.length > 64) {
    return { message };
  }

  return {
    message,
    replyMarkup: {
      inline_keyboard: [[{ text: '☑️ Done', callback_data: callbackData }]],
    },
  };
}

function formatDecisionPacketMessage(data: DailySuggestionSubset): string {
  const blocks = [header(data), actionBlock(data), targetBlock(data)];
  const trigger = triggerBlock(data);
  if (trigger) blocks.push(trigger);
  blocks.push(checksBlock(data));
  blocks.push('[Open strategy](https://v2.zap-pilot.org/strategy)');
  return blocks.filter(Boolean).join('\n\n');
}

function header(data: DailySuggestionSubset): string {
  let title = '✅ *No Action Needed*';
  if (data.action.status === 'action_required') {
    title = `🔁 *Rebalance Needed — ${data.config_display_name}*`;
  } else if (data.action.status === 'blocked') {
    title = '⛔ *Action Blocked*';
  }
  return `${title}\n${data.as_of}`;
}

function actionBlock(data: DailySuggestionSubset): string {
  if (data.action.transfers.length === 0) {
    return `*ACTION*\n${humanizeSlug(data.action.reason_code)}`;
  }
  const visible = data.action.transfers
    .slice(0, 3)
    .map(
      (transfer) =>
        `• Move ${formatUsdAmount(transfer.amount_usd)} from ${humanizeSlug(transfer.from_bucket).toUpperCase()} to ${humanizeSlug(transfer.to_bucket).toUpperCase()}`,
    );
  const hidden = data.action.transfers.length - visible.length;
  if (hidden > 0) visible.push(`• +${hidden} more`);
  return `*ACTION*\n${visible.join('\n')}`;
}

function targetBlock(data: DailySuggestionSubset): string {
  const before = formatAllocation(data.context.portfolio.asset_allocation);
  const after = formatAllocation(data.context.target.allocation);
  return ['*TARGET*', before ? `Before: ${before}` : null, `After: ${after}`]
    .filter((line): line is string => line !== null)
    .join('\n');
}

function formatAllocation(
  allocation: Record<string, number> | null | undefined,
): string {
  if (!allocation) return '';
  const keys = [
    ...ALLOCATION_ORDER.filter((key) => key in allocation),
    ...Object.keys(allocation).filter(
      (key) =>
        !ALLOCATION_ORDER.includes(key as (typeof ALLOCATION_ORDER)[number]),
    ),
  ];
  return keys
    .map((key) => ({
      label: ALLOCATION_LABELS[key.toLowerCase()] ?? humanizeSlug(key),
      percent: (allocation[key] ?? 0) * 100,
    }))
    .filter(({ percent }) => Math.abs(percent) >= MIN_DISPLAYED_PERCENT)
    .map(({ label, percent }) => `${label} ${percent.toFixed(1)}%`)
    .join(' · ');
}

function triggerBlock(data: DailySuggestionSubset): string | null {
  const rule = data.context.strategy.details?.matched_rule_name;
  const lines = [
    '*TRIGGER*',
    `Rule: ${humanizeSlug(rule ?? data.action.reason_code)}`,
  ];
  const evidence = triggerEvidenceLine(data, rule);
  if (evidence) lines.push(...evidence);
  return lines.join('\n');
}

function triggerEvidenceLine(
  data: DailySuggestionSubset,
  rule: string | null | undefined,
): string[] | null {
  const signal = data.context.signal.details;
  if (rule?.startsWith('eth_btc_')) return ratioEvidence(signal?.ratio);
  if (rule?.startsWith('cross_') || rule?.startsWith('dma_overextension_')) {
    return dmaEvidence(signal?.dma);
  }
  if (rule === 'spy_latch') return dmaEvidence(signal?.spy_dma, 'SPY');
  if (rule?.startsWith('fgi_')) return fgiEvidence(data);
  return null;
}

function ratioEvidence(
  ratio: NonNullable<
    DailySuggestionSubset['context']['signal']['details']
  >['ratio'],
): string[] | null {
  if (ratio?.ratio == null || ratio.ratio_dma_200 == null) return null;
  return [
    `Ratio ${ratio.ratio.toFixed(5)} vs 200-DMA ${ratio.ratio_dma_200.toFixed(5)}${formatDistance(ratio.distance)}${formatCross(ratio.cross_event)}`,
  ];
}

function dmaEvidence(
  dma: NonNullable<
    DailySuggestionSubset['context']['signal']['details']
  >['dma'],
  fixedAsset?: string,
): string[] | null {
  if (dma?.dma_200 == null) return null;
  const asset = fixedAsset ?? dma.outer_dma_asset;
  return [
    `${asset ? `${humanizeSlug(asset).toUpperCase()} · ` : ''}200-DMA ${dma.dma_200.toFixed(2)}${formatDistance(dma.distance)}${formatCross(dma.cross_event)}`,
  ];
}

function fgiEvidence(data: DailySuggestionSubset): string[] {
  const market = data.context.market;
  const score = market?.macro_fear_greed?.score ?? market?.sentiment;
  const label = market?.macro_fear_greed?.label ?? market?.sentiment_label;
  const slope = data.context.signal.details?.dma?.fgi_slope;
  return [
    ...(score == null ? [] : [`FGI ${score}${label ? ` (${label})` : ''}`]),
    ...(slope == null ? [] : [`FGI slope ${formatSignedPercent(slope)}`]),
  ];
}

function checksBlock(data: DailySuggestionSubset): string {
  const market = data.context.market;
  const score = market?.macro_fear_greed?.score ?? market?.sentiment;
  const label = market?.macro_fear_greed?.label ?? market?.sentiment_label;
  const regime = data.context.signal.regime;
  const regimeLabel = humanizeSlug(regime);
  const indicator = triggeredIndicator(data);
  const cooldown = formatCooldown(indicator);
  const details = data.context.strategy.details;
  const quota = formatQuota(details);
  return [
    '*CHECKS*',
    `FGI ${score ?? 'unavailable'}${label ? ` (${label})` : ''} · Regime ${REGIME_EMOJI[regime] ?? '⚪'} ${regimeLabel}`,
    `Cooldown: ${cooldown}`,
    quota,
  ].join('\n');
}

function formatCooldown(
  indicator: ReturnType<typeof triggeredIndicator>,
): string {
  if (!indicator?.cooldown_active) return 'none';
  if (indicator.cooldown_remaining_days == null) return 'active';
  return `active, ${indicator.cooldown_remaining_days}d remaining`;
}

function formatQuota(
  details: DailySuggestionSubset['context']['strategy']['details'],
): string {
  if (details?.enabled == null) return 'Quota: data unavailable';
  const trades =
    details.trades_7d != null && details.max_trades_7d != null
      ? `Trades 7d: ${details.trades_7d}/${details.max_trades_7d}`
      : 'Trades 7d: unavailable';
  return [
    trades,
    details.next_trade_date ? `next trade ${details.next_trade_date}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

function triggeredIndicator(data: DailySuggestionSubset) {
  const rule = data.context.strategy.details?.matched_rule_name;
  if (rule?.startsWith('eth_btc_')) return data.context.signal.details?.ratio;
  if (rule === 'spy_latch') return data.context.signal.details?.spy_dma;
  return data.context.signal.details?.dma;
}

function formatDistance(value: number | null | undefined): string {
  return value == null ? '' : ` (${formatSignedPercent(value)})`;
}

function formatSignedPercent(value: number): string {
  const percent = Math.abs(value) <= 1 ? value * 100 : value;
  return `${percent >= 0 ? '+' : ''}${percent.toFixed(1)}%`;
}

function formatCross(value: string | null | undefined): string {
  return value ? ` — ${humanizeSlug(value)}` : '';
}
