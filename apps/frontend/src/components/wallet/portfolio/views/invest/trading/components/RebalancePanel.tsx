import { cn } from '@zapengine/app-core/lib/ui/classNames';
import {
  buildTradeActions,
  formatRegimeLabel,
  getStatusPanelContent,
} from '@zapengine/app-core/services/suggestion';
import { formatCurrency } from '@zapengine/app-core/utils/formatters';
import { CircleDollarSign } from 'lucide-react';
import { useState } from 'react';

import { StaleDataBanner } from '@/components/shared/StaleDataBanner';

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
            currentAllocation={data.context.portfolio.asset_allocation}
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
