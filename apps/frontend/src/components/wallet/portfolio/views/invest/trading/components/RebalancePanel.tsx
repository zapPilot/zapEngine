import { CircleDollarSign } from 'lucide-react';
import { useState } from 'react';

import { StaleDataBanner } from '@/components/shared/StaleDataBanner';
import { cn } from '@/lib/ui/classNames';
import type { BacktestBucket } from '@/types/backtesting';
import type { DailySuggestionResponse } from '@/types/strategy';
import { formatCurrency } from '@/utils/formatters';

import { useDailySuggestion } from '../hooks/useDailySuggestion';
import { useDefaultPresetId } from '../hooks/useDefaultPresetId';
import { BaseTradingPanel } from './BaseTradingPanel';
import { ImpactVisual } from './ImpactVisual';

const ACTION_STYLES: Record<string, string> = {
  buy: 'bg-green-500 shadow-green-200 dark:shadow-none',
  sell: 'bg-red-500 shadow-red-200 dark:shadow-none',
};

const ACTION_LABELS: Record<string, string> = {
  buy: 'Add',
  sell: 'Reduce',
};

const SPOT_BUCKET_LABEL = 'SPOT';
const STABLE_BUCKET_LABEL = 'STABLE';

type SpotAssetSymbol = 'BTC' | 'ETH' | 'SPY';
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

interface DerivedTradeAction {
  action: 'buy' | 'sell';
  bucket: BacktestBucket;
  bucketLabel: string;
  amount_usd: number;
  description: string;
}

interface StatusPanelContent {
  actionCardTitle: string;
  actionCardSubtitle: string;
  bodyTitle: string;
  bodyDescription: string;
  ctaLabel: string;
  ctaDisabled: boolean;
}

function formatRegimeLabel(value: string | null | undefined): string {
  return (value ?? 'unknown').replace(/_/g, ' ');
}

function normalizeSpotAsset(value: unknown): SpotAssetSymbol | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  if (normalized === 'BTC' || normalized === 'ETH' || normalized === 'SPY') {
    return normalized;
  }

  return null;
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

function buildTradeActions(
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

function getStatusPanelContent(
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

function RebalancePanelSkeleton() {
  return (
    <div
      className="max-w-md mx-auto space-y-12"
      role="status"
      aria-label="Loading rebalance data"
    >
      {/* Header: title + skeleton subtitle */}
      <div className="text-center space-y-2">
        <h3 className="text-4xl font-light text-gray-900 dark:text-white">
          Portfolio Health
        </h3>
        <div className="flex justify-center">
          <div className="h-4 w-40 bg-gray-700/50 rounded animate-pulse" />
        </div>
      </div>

      {/* ActionCard skeleton */}
      <div className="max-w-md mx-auto bg-white dark:bg-gray-900 rounded-3xl p-8 shadow-xl shadow-black/20 border border-gray-100 dark:border-gray-800">
        {/* Header: title + subtitle + icon */}
        <div className="flex items-center justify-between mb-8">
          <div className="space-y-1">
            <div className="h-4 w-32 bg-gray-700/50 rounded animate-pulse" />
            <div className="h-6 w-28 bg-gray-700/50 rounded animate-pulse" />
          </div>
          <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 animate-pulse" />
        </div>

        <div className="space-y-8">
          {/* ImpactVisual placeholder */}
          <div className="p-6 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-gray-100 dark:border-gray-800">
            <div className="h-40 w-full bg-gray-700/30 rounded-2xl animate-pulse" />
          </div>

          {/* Trade row skeletons */}
          <div className="space-y-4 pt-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center justify-between p-3 -mx-3"
              >
                <div className="flex items-center gap-4">
                  <div className="w-2 h-2 rounded-full bg-gray-600 animate-pulse" />
                  <div className="h-5 w-32 bg-gray-700/50 rounded animate-pulse" />
                </div>
                <div className="h-7 w-20 bg-gray-800/50 rounded-lg animate-pulse" />
              </div>
            ))}
          </div>
        </div>

        {/* Footer: disabled CTA */}
        <div className="mt-8 pt-8 border-t border-gray-100 dark:border-gray-800">
          <button
            disabled
            className="w-full py-4 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-black font-medium opacity-50 cursor-not-allowed"
          >
            Review & Execute All
          </button>
        </div>
      </div>
    </div>
  );
}

export function RebalancePanel({ userId }: { userId: string }) {
  const [isReviewOpen, setIsReviewOpen] = useState(false);

  const defaultPresetId = useDefaultPresetId(true);

  const { data, error } = useDailySuggestion(userId, defaultPresetId);

  if (!data && error) {
    return (
      <div className="max-w-md mx-auto bg-white dark:bg-gray-900 rounded-3xl p-8 shadow-xl shadow-black/20 border border-gray-100 dark:border-gray-800">
        <div className="text-center space-y-4">
          <div className="text-red-400 font-medium">
            Failed to load suggestion
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400">
            {error instanceof Error ? error.message : 'Unknown error'}
          </div>
        </div>
      </div>
    );
  }

  if (!data) return <RebalancePanelSkeleton />;

  const tradeActions = buildTradeActions(data);
  const regimeLabel = formatRegimeLabel(data.context.signal.regime);
  const panelContent = getStatusPanelContent(data, tradeActions);

  return (
    <>
      {data.data_freshness && (
        <StaleDataBanner freshness={data.data_freshness} />
      )}
      <BaseTradingPanel
        title="Portfolio Health"
        subtitle={
          <>
            Aligned with{' '}
            <span className="text-gray-900 dark:text-white font-medium capitalize">
              {regimeLabel}
            </span>{' '}
            Regime
          </>
        }
        actionCardTitle={panelContent.actionCardTitle}
        actionCardSubtitle={panelContent.actionCardSubtitle}
        actionCardIcon={
          <CircleDollarSign className="w-6 h-6 text-gray-900 dark:text-white" />
        }
        impactVisual={
          <ImpactVisual
            currentAllocation={data.context.portfolio.allocation}
            targetAllocation={data.context.target.allocation}
          />
        }
        footer={
          <button
            type="button"
            disabled={panelContent.ctaDisabled}
            onClick={() => {
              if (!panelContent.ctaDisabled) {
                setIsReviewOpen(true);
              }
            }}
            className={cn(
              'w-full py-4 rounded-xl font-medium transition-opacity',
              panelContent.ctaDisabled
                ? 'bg-gray-200 dark:bg-gray-800 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                : 'bg-gray-900 dark:bg-white text-white dark:text-black hover:opacity-90 shadow-lg shadow-gray-200 dark:shadow-none',
            )}
          >
            {panelContent.ctaLabel}
          </button>
        }
        isReviewOpen={isReviewOpen}
        onCloseReview={() => setIsReviewOpen(false)}
        onConfirmReview={() => setIsReviewOpen(false)}
      >
        {data.action.status === 'action_required' ? (
          <div className="space-y-4 pt-2">
            {tradeActions.map((trade, i) => (
              <div
                key={i}
                className="flex items-center justify-between group cursor-default p-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded-xl transition-colors -mx-3"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div
                    className={cn(
                      'w-2 h-2 rounded-full transition-all group-hover:scale-125 shadow-sm',
                      ACTION_STYLES[trade.action],
                    )}
                  />
                  <div className="min-w-0">
                    <div className="text-lg font-light text-gray-600 dark:text-gray-300">
                      <span className="font-medium text-gray-900 dark:text-white">
                        {ACTION_LABELS[trade.action]}
                      </span>{' '}
                      <span className="text-gray-400 mx-1">·</span>{' '}
                      {trade.bucketLabel}
                    </div>
                    <div className="text-xs text-gray-500 truncate">
                      {trade.description}
                    </div>
                  </div>
                </div>
                <span className="font-mono text-gray-900 dark:text-white font-medium bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded-lg text-sm">
                  {formatCurrency(trade.amount_usd)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="pt-2">
            <div className="p-5 rounded-2xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 space-y-2">
              <p className="text-lg font-medium text-gray-900 dark:text-white">
                {panelContent.bodyTitle}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {panelContent.bodyDescription}
              </p>
            </div>
          </div>
        )}
      </BaseTradingPanel>
    </>
  );
}
