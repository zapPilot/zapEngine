import { CHANNEL_TYPE_TELEGRAM, REGIME_EMOJI } from '../../common/constants';
import { formatShortWalletAddress } from '../../common/utils';
import { DailySuggestionData, DriftAlertData } from './interfaces';

export const DAILY_SUGGESTION_DONE_PREFIX = 'dsdone';

export const REASON_LABELS: Record<string, string> = {
  above_greed_sell: 'Greed remains elevated, so the strategy stays defensive.',
  already_aligned: 'Portfolio is already aligned with the current target.',
  below_extreme_fear_buy:
    'Extreme fear remains in place, so the strategy stays risk-on.',
  eth_btc_ratio_cooldown_active: 'ETH/BTC rotation cooldown is still active.',
  eth_btc_ratio_rebalance: 'ETH/BTC rotation is out of balance.',
  eth_outperforming_btc: 'ETH is still outperforming BTC.',
  interval_wait: 'Minimum rebalance interval has not elapsed yet.',
  trade_quota_min_interval_active: 'Trade quota cooldown is still active.',
};

export interface TelegramMessagePayload {
  message: string;
  replyMarkup?: {
    inline_keyboard: { text: string; callback_data: string }[][];
  };
}

export function formatUsdAmount(amount: number): string {
  return `$${amount.toLocaleString('en-US', {
    maximumFractionDigits: 0,
  })}`;
}

export function formatIdentifierUppercase(value: string): string {
  return value.replaceAll(/[_-]+/g, ' ').toUpperCase();
}

export function formatIdentifierTitleCase(value: string): string {
  return value
    .replaceAll(/[_-]+/g, ' ')
    .split(' ')
    .filter((part) => part.length > 0)
    .map((part) => (part[0] ?? '').toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

export function humanizeReasonCode(reasonCode: string): string {
  const mappedLabel = REASON_LABELS[reasonCode];
  if (mappedLabel) {
    return mappedLabel;
  }

  const normalized = reasonCode.replaceAll(/[_-]+/g, ' ').trim().toLowerCase();
  if (!normalized) {
    return 'No additional context.';
  }

  return (normalized[0] ?? '').toUpperCase() + normalized.slice(1) + '.';
}

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

export function buildDailySuggestionMessagePayload(
  data: DailySuggestionData,
): TelegramMessagePayload {
  const message = formatDailySuggestionMessage(data);
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

export function formatDailySuggestionMessage(
  data: DailySuggestionData,
): string {
  const regime = data.context.signal.regime;
  const regimeEmoji = REGIME_EMOJI[regime] ?? '⚪';
  const regimeLabel = formatIdentifierTitleCase(regime);
  const sentiment =
    data.context.market.sentiment !== null
      ? ` (FGI: ${data.context.market.sentiment})`
      : '';
  const contextLine = `${data.config_display_name} · ${regimeLabel}${sentiment}`;
  const portfolioSummary = formatDailySuggestionPortfolioSummary(data);
  const whyLine = humanizeReasonCode(data.action.reason_code);

  if (data.action.status === 'blocked') {
    return (
      `⛔ *Action Blocked*\n\n` +
      `${regimeEmoji} ${contextLine}\n` +
      `Why: ${whyLine}\n` +
      portfolioSummary
    );
  }

  if (data.action.status === 'no_action') {
    return (
      `✅ *No Action Needed*\n\n` +
      `${regimeEmoji} ${contextLine}\n` +
      `Why: ${whyLine}\n` +
      portfolioSummary
    );
  }

  let message =
    `🔁 *Rebalance Needed*\n\n` +
    `${regimeEmoji} ${contextLine}\n\n` +
    '*Do now:*\n';

  for (const transfer of data.action.transfers.slice(0, 3)) {
    message +=
      `• Move ${formatUsdAmount(transfer.amount_usd)} ` +
      `from ${formatIdentifierUppercase(transfer.from_bucket)} ` +
      `to ${formatIdentifierUppercase(transfer.to_bucket)}\n`;
  }

  if (data.action.transfers.length > 3) {
    message += `• +${data.action.transfers.length - 3} more\n`;
  }

  message += `\nWhy: ${whyLine}\n` + portfolioSummary;

  return message;
}

export function formatDailySuggestionPortfolioSummary(
  data: DailySuggestionData,
): string {
  const totalDebt = data.context.portfolio.total_debt_usd ?? 0;
  if (totalDebt <= 0) {
    return `Portfolio: ${formatUsdAmount(data.context.portfolio.total_value)}`;
  }

  const totalAssets =
    data.context.portfolio.total_assets_usd ??
    data.context.portfolio.total_value;
  const totalNet =
    data.context.portfolio.total_net_usd ?? totalAssets - totalDebt;

  return (
    `Net: ${formatUsdAmount(totalNet)}\n` +
    `Assets: ${formatUsdAmount(totalAssets)}\n` +
    `Debt: ${formatUsdAmount(totalDebt)}`
  );
}

export function formatDriftMessage(data: DriftAlertData): string {
  // Drift alerts use the higher-fidelity 8/6 visual (vs the email default 6/4).
  const walletShort = formatShortWalletAddress(data.wallet_address, {
    head: 8,
    tail: 6,
  });
  const driftFormatted = data.drift_percentage.toFixed(1);

  let message =
    `⚠️ *Portfolio Drift Alert*\n\n` +
    `Your portfolio has drifted *${driftFormatted}%* from target allocation.\n\n` +
    `Wallet: \`${walletShort}\`\n\n`;

  if (data.recommendations.length > 0) {
    message += '*Recommendations:*\n';

    for (const rec of data.recommendations.slice(0, 5)) {
      const emoji = rec.action === 'buy' ? '🟢' : '🔴';
      const action = rec.action.charAt(0).toUpperCase() + rec.action.slice(1);
      message += `${emoji} ${action} $${rec.amount_usd.toFixed(0)} ${rec.token}\n`;
    }

    message += '\n';
  }

  message +=
    `Rebalancing recommended to maintain your investment strategy.\n\n` +
    `[Open Zap Pilot](https://zap-pilot.com/rebalance?wallet=${data.wallet_address})`;

  return message;
}

export { CHANNEL_TYPE_TELEGRAM };
