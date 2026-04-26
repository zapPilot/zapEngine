import type { MarketDataFreshness } from '@zapengine/types';
import { AlertCircle } from 'lucide-react';

interface StaleDataBannerProps {
  freshness: MarketDataFreshness;
}

export function StaleDataBanner({ freshness }: StaleDataBannerProps) {
  if (!freshness?.is_stale) {
    return null;
  }

  const featureSummary = freshness.stale_features
    .map((f) => `${f.asset} ${f.feature_name} (${f.effective_date})`)
    .join(', ');

  return (
    <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 mb-3 flex items-start gap-2">
      <AlertCircle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
      <div className="text-sm">
        <div className="font-medium text-amber-200">
          Market data updating — showing decision based on{' '}
          {freshness.effective_date}
        </div>
        <div className="text-amber-300/80 text-xs mt-1">
          Stale: {featureSummary}
        </div>
      </div>
    </div>
  );
}
