import { type JSX, useMemo, useState } from 'react';

import { LoadingState } from '@/components/ui';
import { useMarketDashboardQuery } from '@/hooks/queries/market/useMarketDashboardQuery';
import { useToggleSet } from '@/hooks/ui';
import { REGIME_LABELS } from '@/lib/domain/regimeMapper';
import type { MarketDashboardPoint } from '@/services';

import { MarketOverviewChart } from './MarketOverviewChart';
import { ChartLegendToggle, TimeframePicker } from './sections';
import {
  DEFAULT_ACTIVE_LINES,
  formatRatioValue,
  getRegimeColor,
  getRegimeLabel,
  MARKET_VIEW_MAX_DAYS,
  MARKET_VIEW_TIMEFRAMES,
  type MarketLineKey,
  REGIME_COLORS,
  type Timeframe,
} from './sections/marketDashboardConstants';
import { SimpleStatCard } from './sections/SimpleStatCard';

function getRelativeStrengthSignal(isAboveDma: boolean | null | undefined): {
  label: string;
  valueClass: string;
  detail: string;
} {
  if (isAboveDma === true) {
    return {
      label: 'ETH leading',
      valueClass: 'text-emerald-300',
      detail: 'ETH/BTC is trading above its 200-day trend.',
    };
  }

  if (isAboveDma === false) {
    return {
      label: 'BTC leading',
      valueClass: 'text-amber-300',
      detail: 'ETH/BTC is below its 200-day trend.',
    };
  }

  return {
    label: 'Insufficient data',
    valueClass: 'text-gray-300',
    detail: 'Need 200 overlapping ETH/BTC daily points for a crossover signal.',
  };
}

/**
 * Slice the snapshots array to the trailing N days based on the selected
 * timeframe. We fetch MAX once and slice locally to avoid duplicate network
 * calls when the user toggles between 1Y and MAX.
 */
function sliceSnapshots(
  snapshots: readonly MarketDashboardPoint[],
  timeframe: Timeframe,
): MarketDashboardPoint[] {
  if (snapshots.length === 0) {
    return [];
  }
  const tf = MARKET_VIEW_TIMEFRAMES.find((entry) => entry.id === timeframe);
  if (!tf || tf.days >= MARKET_VIEW_MAX_DAYS) {
    return snapshots.slice();
  }
  // Snapshots arrive sorted ascending by date; take the trailing window
  // straight off the array end. Avoids re-parsing every `snapshot_date`.
  return snapshots.slice(Math.max(0, snapshots.length - tf.days));
}

export function MarketDashboardView(): JSX.Element {
  const [timeframe, setTimeframe] = useState<Timeframe>('MAX');
  const { activeSet: activeLines, toggle: handleToggleLine } =
    useToggleSet<MarketLineKey>({ initialValue: DEFAULT_ACTIVE_LINES });

  const { data: dashboardData, isLoading } =
    useMarketDashboardQuery(MARKET_VIEW_MAX_DAYS);

  const allSnapshots = useMemo<MarketDashboardPoint[]>(
    () => dashboardData?.snapshots ?? [],
    [dashboardData?.snapshots],
  );

  const filteredSnapshots = useMemo<MarketDashboardPoint[]>(
    () => sliceSnapshots(allSnapshots, timeframe),
    [allSnapshots, timeframe],
  );

  const latestPoint = filteredSnapshots[filteredSnapshots.length - 1];

  // Walk backwards to the most recent point that has a non-null ETH/BTC ratio
  // — protects the stat cards from gaps in the joined series (e.g. days where
  // the ratio's 200-DMA hasn't materialized yet).
  const latestEthBtcPoint = useMemo<{
    ratio: number;
    dma_200: number | null;
    is_above: boolean | null;
  } | null>(() => {
    for (let i = filteredSnapshots.length - 1; i >= 0; i--) {
      const ethBtc = filteredSnapshots[i]?.values['eth_btc'];
      if (ethBtc?.value != null) {
        const dma = ethBtc.indicators?.['dma_200'];
        return {
          ratio: ethBtc.value,
          dma_200: dma?.value ?? null,
          is_above: dma?.is_above ?? null,
        };
      }
    }
    return null;
  }, [filteredSnapshots]);

  const relativeStrengthSignal = getRelativeStrengthSignal(
    latestEthBtcPoint?.is_above,
  );

  const latestBtc = latestPoint?.values['btc'];
  const latestFgi = latestPoint?.values['fgi'];
  const latestBtcPrice = latestBtc?.value ?? null;
  const latestBtcDma = latestBtc?.indicators?.['dma_200']?.value ?? null;
  const latestSentiment = latestFgi?.value ?? null;
  const latestRegime = latestFgi?.tags?.['regime'] ?? null;

  if (isLoading) {
    return (
      <LoadingState
        size="lg"
        className="w-full h-[600px] bg-gray-900/50 rounded-xl border border-gray-800"
      />
    );
  }

  return (
    <div className="flex flex-col gap-6 w-full h-full px-4 py-6 bg-gray-900/50 rounded-xl border border-gray-800">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-white">Market Overview</h2>
            <p className="text-sm text-gray-400">
              BTC/ETH Price, ETH/BTC Ratio, and Fear &amp; Greed Index
            </p>
          </div>
          <div className="flex items-center gap-4">
            <TimeframePicker
              value={timeframe}
              onChange={setTimeframe}
              testIdPrefix="btc-tf-"
              borderColor="border-gray-700"
              activeColor="bg-purple-600"
              buttonSize="px-4 py-1.5 text-sm"
              timeframes={MARKET_VIEW_TIMEFRAMES}
            />
            <ChartLegendToggle
              activeLines={activeLines}
              onToggle={handleToggleLine}
            />
          </div>
        </div>

        <MarketOverviewChart
          data={filteredSnapshots}
          activeLines={activeLines}
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
          <SimpleStatCard
            label="Current BTC Price"
            value={`$${latestBtcPrice?.toLocaleString() ?? '---'}`}
            valueClass="text-white"
          />
          <SimpleStatCard
            label="Current 200 DMA"
            value={`$${latestBtcDma?.toLocaleString() ?? '---'}`}
            valueClass="text-[#A855F7]"
          />
          <div className="p-5 bg-gray-800/40 rounded-xl border border-gray-700/50 hover:bg-gray-800/60 transition-colors">
            <p className="text-sm font-medium text-gray-400 mb-1">
              Fear &amp; Greed Index
            </p>
            <div className="flex flex-col">
              <p
                className="text-2xl font-bold"
                style={{
                  color: getRegimeColor(latestRegime, '#10B981'),
                }}
              >
                {latestSentiment ?? '---'} / 100
                {latestRegime && (
                  <span className="text-sm ml-2 font-medium opacity-80">
                    ({getRegimeLabel(latestRegime)})
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

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <SimpleStatCard
            label="Current ETH/BTC Ratio"
            value={formatRatioValue(latestEthBtcPoint?.ratio)}
            valueClass="text-emerald-300"
            detail="ETH price divided by BTC price on the latest overlapping day."
          />
          <SimpleStatCard
            label="Ratio 200 DMA"
            value={formatRatioValue(latestEthBtcPoint?.dma_200)}
            valueClass="text-amber-300"
            detail="200-day moving average of the ETH/BTC ratio."
          />
          <SimpleStatCard
            label="Leader Signal"
            value={relativeStrengthSignal.label}
            valueClass={relativeStrengthSignal.valueClass}
            detail={relativeStrengthSignal.detail}
          />
        </div>
      </div>
    </div>
  );
}
