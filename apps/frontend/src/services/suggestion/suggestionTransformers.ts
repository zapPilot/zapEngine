/**
 * Suggestion Transformers
 *
 * Pure functions that map a `DailySuggestionResponse` into the view models the
 * rebalance UI renders. No React, no side effects — safe to unit test in
 * isolation and reuse across components.
 */

import {
  normalizeSpotAsset,
  type SpotAssetSymbol,
} from '@/lib/domain/spotAsset';
import type { BacktestBucket } from '@/types/backtesting';
import type { DailySuggestionResponse } from '@/types/strategy';

const SPOT_BUCKET_LABEL = 'SPOT';
const STABLE_BUCKET_LABEL = 'STABLE';

const REASON_LABELS: Record<string, string> = {
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

export interface DerivedTradeAction {
  action: 'buy' | 'sell';
  bucket: BacktestBucket;
  bucketLabel: string;
  amount_usd: number;
  description: string;
}

export interface StatusPanelContent {
  actionCardTitle: string;
  actionCardSubtitle: string;
  bodyTitle: string;
  bodyDescription: string;
  ctaLabel: string;
  ctaDisabled: boolean;
}

export function formatRegimeLabel(value: string | null | undefined): string {
  return (value ?? 'unknown').replace(/_/g, ' ');
}

function getTargetSpotAsset(
  data: DailySuggestionResponse,
): SpotAssetSymbol | null {
  return normalizeSpotAsset(data.context.strategy.details?.target_spot_asset);
}

function getBucketLabel(
  bucket: BacktestBucket,
  targetSpotAsset: SpotAssetSymbol | null,
): string {
  if (bucket === 'stable') {
    return STABLE_BUCKET_LABEL;
  }

  if (bucket === 'eth') {
    return 'ETH';
  }

  if (bucket === 'btc') {
    return 'BTC';
  }

  if (bucket === 'spy') {
    return 'SPY';
  }

  return targetSpotAsset ?? SPOT_BUCKET_LABEL;
}

export function buildTradeActions(
  data: DailySuggestionResponse,
): DerivedTradeAction[] {
  const targetSpotAsset = getTargetSpotAsset(data);
  return data.action.transfers.map((transfer) => {
    const action = transfer.to_bucket !== 'stable' ? 'buy' : 'sell';
    const actionBucket =
      action === 'buy' ? transfer.to_bucket : transfer.from_bucket;

    return {
      action,
      bucket: actionBucket,
      bucketLabel: getBucketLabel(actionBucket, targetSpotAsset),
      amount_usd: transfer.amount_usd,
      description: `${getBucketLabel(transfer.from_bucket, targetSpotAsset)} -> ${getBucketLabel(
        transfer.to_bucket,
        targetSpotAsset,
      )}`,
    };
  });
}

function humanizeReasonCode(reasonCode: string): string {
  const mappedReason = REASON_LABELS[reasonCode];
  if (mappedReason) {
    return mappedReason;
  }

  const normalized = reasonCode.replaceAll(/[_-]+/g, ' ').trim().toLowerCase();
  if (!normalized) {
    return 'No additional context.';
  }

  return normalized.charAt(0).toUpperCase() + normalized.slice(1) + '.';
}

export function getStatusPanelContent(
  data: DailySuggestionResponse,
  tradeActions: DerivedTradeAction[],
): StatusPanelContent {
  if (data.action.status === 'action_required') {
    const actionCount = tradeActions.length;
    return {
      actionCardTitle: `${actionCount} Action${actionCount === 1 ? '' : 's'}`,
      actionCardSubtitle: 'Suggested Moves',
      bodyTitle: '',
      bodyDescription: '',
      ctaLabel: 'Review & Execute All',
      ctaDisabled: false,
    };
  }

  if (data.action.status === 'blocked') {
    return {
      actionCardTitle: 'Action Blocked',
      actionCardSubtitle: 'Trading temporarily unavailable',
      bodyTitle: 'Action blocked',
      bodyDescription: humanizeReasonCode(data.action.reason_code),
      ctaLabel: 'Execution Unavailable',
      ctaDisabled: true,
    };
  }

  return {
    actionCardTitle: '0 Actions',
    actionCardSubtitle: 'No trades needed',
    bodyTitle: 'No trades needed',
    bodyDescription: humanizeReasonCode(data.action.reason_code),
    ctaLabel: 'No Action Needed',
    ctaDisabled: true,
  };
}
