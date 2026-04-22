import { type JSX, useEffect, useMemo, useRef, useState } from 'react';

import { LoadingState } from '@/components/ui';
import { MARKET_SECTION_TABS } from '@/components/wallet/portfolio/components/navigation';
import { useMarketDashboardQuery } from '@/hooks/queries/market/useMarketDashboardQuery';
import { REGIME_LABELS } from '@/lib/domain/regimeMapper';
import type { MarketDashboardPoint } from '@/services';
import type { MarketSection } from '@/types';

import { MarketOverviewChart } from './MarketOverviewChart';
import { TimeframePicker } from './sections';
import {
  getRegimeColor,
  getRegimeLabel,
  REGIME_COLORS,
  type Timeframe,
  TIMEFRAMES,
} from './sections/marketDashboardConstants';
import { RelativeStrengthSection } from './sections/RelativeStrengthSection';
import { SimpleStatCard } from './sections/SimpleStatCard';

interface MarketDashboardViewProps {
  activeSection?: MarketSection;
  onSectionChange?: (section: MarketSection) => void;
}

const noop = (): void => {
  /* no-op */
};

function getSectionButtonClassName(isActive: boolean): string {
  return [
    'rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] transition-colors',
    isActive
      ? 'border-purple-400/30 bg-purple-500/15 text-white'
      : 'border-gray-700 bg-gray-800/60 text-gray-400 hover:border-gray-500 hover:text-gray-200',
  ].join(' ');
}

export function MarketDashboardView({
  activeSection = 'overview',
  onSectionChange = noop,
}: MarketDashboardViewProps): JSX.Element {
  const [timeframe, setTimeframe] = useState<Timeframe>('1Y');
  const overviewSectionRef = useRef<HTMLDivElement>(null);
  const relativeStrengthSectionRef = useRef<HTMLDivElement>(null);
  const hasMountedRef = useRef(false);
  const activeDays = TIMEFRAMES.find((tf) => tf.id === timeframe)?.days ?? 365;
  const { data: dashboardData, isLoading } =
    useMarketDashboardQuery(activeDays);
  const filteredData = useMemo<MarketDashboardPoint[]>(
    () => dashboardData?.snapshots ?? [],
    [dashboardData?.snapshots],
  );

  const latestPoint = filteredData[filteredData.length - 1];

  useEffect(() => {
    if (isLoading) {
      return;
    }

    const shouldScrollToOverview =
      hasMountedRef.current && activeSection === 'overview';
    const shouldScrollToRelativeStrength =
      activeSection === 'relative-strength';

    if (!shouldScrollToOverview && !shouldScrollToRelativeStrength) {
      hasMountedRef.current = true;
      return;
    }

    const targetElement =
      activeSection === 'relative-strength'
        ? relativeStrengthSectionRef.current
        : overviewSectionRef.current;

    targetElement?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    hasMountedRef.current = true;
  }, [activeSection, isLoading]);

  if (isLoading) {
    return (
      <LoadingState
        size="lg"
        className="w-full h-[600px] bg-gray-900/50 rounded-xl border border-gray-800"
      />
    );
  }

  return (
    <div className="flex flex-col gap-6 w-full h-full p-6 bg-gray-900/50 rounded-xl border border-gray-800">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {MARKET_SECTION_TABS.map((section) => (
            <button
              key={section.id}
              type="button"
              data-testid={`market-section-${section.id}`}
              onClick={() => onSectionChange(section.id)}
              className={getSectionButtonClassName(
                activeSection === section.id,
              )}
            >
              {section.label}
            </button>
          ))}
        </div>

        <div
          ref={overviewSectionRef}
          data-testid="market-section-content-overview"
          className="flex flex-col gap-6"
        >
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-white">Market Overview</h2>
              <p className="text-sm text-gray-400">
                BTC Price, 200 DMA, and Fear & Greed Index
              </p>
            </div>
            <TimeframePicker
              value={timeframe}
              onChange={setTimeframe}
              testIdPrefix="btc-tf-"
              borderColor="border-gray-700"
              activeColor="bg-purple-600"
              buttonSize="px-4 py-1.5 text-sm"
            />
          </div>

          <MarketOverviewChart data={filteredData} />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
            <SimpleStatCard
              label="Current BTC Price"
              value={`$${latestPoint?.price_usd.toLocaleString() ?? '---'}`}
              valueClass="text-white"
            />
            <SimpleStatCard
              label="Current 200 DMA"
              value={`$${latestPoint?.dma_200?.toLocaleString() ?? '---'}`}
              valueClass="text-[#A855F7]"
            />
            <div className="p-5 bg-gray-800/40 rounded-xl border border-gray-700/50 hover:bg-gray-800/60 transition-colors">
              <p className="text-sm font-medium text-gray-400 mb-1">
                Fear & Greed Index
              </p>
              <div className="flex flex-col">
                <p
                  className="text-2xl font-bold"
                  style={{
                    color: getRegimeColor(latestPoint?.regime, '#10B981'),
                  }}
                >
                  {latestPoint?.sentiment_value ?? '---'} / 100
                  {latestPoint?.regime && (
                    <span className="text-sm ml-2 font-medium opacity-80">
                      ({getRegimeLabel(latestPoint.regime)})
                    </span>
                  )}
                </p>
                <div className="flex items-center gap-2 mt-2">
                  {Object.entries(REGIME_COLORS).map(([key, color]) => (
                    <div
                      key={key}
                      className="flex items-center gap-1"
                      title={REGIME_LABELS[key as keyof typeof REGIME_LABELS]}
                    >
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: color }}
                      />
                      <span className="text-[10px] text-gray-500 font-medium uppercase">
                        {key}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div
        ref={relativeStrengthSectionRef}
        data-testid="market-section-content-relative-strength"
      >
        <RelativeStrengthSection />
      </div>
    </div>
  );
}
