import { type JSX, useMemo, useState } from 'react';
import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { useMarketDashboardQuery } from '@/hooks/queries/market/useMarketDashboardQuery';
import type { MarketDashboardPoint } from '@/services';

import { SimpleStatCard, TimeframePicker } from '.';
import {
  AXIS_COLOR,
  formatRatioLabel,
  formatRatioValue,
  formatXAxisDate,
  type Timeframe,
  TIMEFRAMES,
} from './marketDashboardConstants';

const RATIO_AXIS_COLOR = '#6EE7B7';

interface RelativeStrengthPoint {
  snapshot_date: string;
  ratio: number | null;
  dma_200: number | null;
  is_above_dma: boolean | null;
}

interface CrossPoint {
  snapshot_date: string;
  ratio: number;
  direction: 'above' | 'below';
}

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
 * ETH/BTC Relative Strength chart section with ratio vs 200 DMA overlay.
 *
 * @returns Relative strength section element
 */
export function RelativeStrengthSection(): JSX.Element {
  const [ratioTimeframe, setRatioTimeframe] = useState<Timeframe>('MAX');
  const ratioDays =
    TIMEFRAMES.find((tf) => tf.id === ratioTimeframe)?.days ?? 1900;
  const { data: ratioData, isLoading: isRatioLoading } =
    useMarketDashboardQuery(ratioDays);

  const ratioSnapshots = useMemo<MarketDashboardPoint[]>(
    () => ratioData?.snapshots ?? [],
    [ratioData?.snapshots],
  );

  const relativeStrengthData = useMemo<RelativeStrengthPoint[]>(
    () =>
      ratioSnapshots.map((snapshot) => ({
        snapshot_date: snapshot.snapshot_date,
        ratio: snapshot.eth_btc_relative_strength?.ratio ?? null,
        dma_200: snapshot.eth_btc_relative_strength?.dma_200 ?? null,
        is_above_dma: snapshot.eth_btc_relative_strength?.is_above_dma ?? null,
      })),
    [ratioSnapshots],
  );

  const latestRelativeStrengthPoint = useMemo(
    () =>
      [...relativeStrengthData]
        .reverse()
        .find((point) => point.ratio != null) ?? null,
    [relativeStrengthData],
  );
  const relativeStrengthSignal = getRelativeStrengthSignal(
    latestRelativeStrengthPoint?.is_above_dma,
  );

  const crossPoints = useMemo<CrossPoint[]>(() => {
    const points: CrossPoint[] = [];
    for (let i = 1; i < relativeStrengthData.length; i++) {
      const prev = relativeStrengthData[i - 1] as
        | RelativeStrengthPoint
        | undefined;
      const curr = relativeStrengthData[i] as RelativeStrengthPoint | undefined;
      if (
        prev?.is_above_dma != null &&
        curr?.is_above_dma != null &&
        prev.is_above_dma !== curr.is_above_dma &&
        curr.ratio != null
      ) {
        points.push({
          snapshot_date: curr.snapshot_date,
          ratio: curr.ratio,
          direction: curr.is_above_dma ? 'above' : 'below',
        });
      }
    }
    return points;
  }, [relativeStrengthData]);

  return (
    <section className="relative overflow-hidden rounded-2xl border border-emerald-500/15 bg-gradient-to-br from-gray-900/90 via-gray-900/70 to-emerald-950/20 p-5">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(52,211,153,0.16),transparent_40%),radial-gradient(circle_at_bottom_right,rgba(245,158,11,0.12),transparent_35%)]" />
      <div className="relative">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-emerald-300/70">
              Relative Strength
            </p>
            <h3 className="mt-2 text-lg font-semibold text-white">
              ETH/BTC Ratio vs 200 DMA
            </h3>
            <p className="mt-1 text-sm text-gray-400">
              Track whether ETH is gaining leadership over BTC on a long-horizon
              trend basis.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <TimeframePicker
              value={ratioTimeframe}
              onChange={setRatioTimeframe}
              testIdPrefix="ratio-tf-"
              keyPrefix="ratio-"
              borderColor="border-emerald-500/20"
              activeColor="bg-emerald-600"
              buttonSize="px-3 py-1 text-xs"
            />
            <div className="inline-flex items-center rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-200">
              {relativeStrengthSignal.label}
            </div>
          </div>
        </div>

        <div className="mt-5 h-[260px] rounded-2xl border border-gray-800/80 bg-black/10 p-3 relative">
          {isRatioLoading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-black/30">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
            </div>
          )}
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={relativeStrengthData}
              margin={{ top: 20, right: 20, left: 20, bottom: 10 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#374151"
                vertical={false}
              />
              <XAxis
                dataKey="snapshot_date"
                stroke={AXIS_COLOR}
                tick={{ fill: AXIS_COLOR, fontSize: 11 }}
                minTickGap={40}
                tickFormatter={formatXAxisDate}
              />
              <YAxis
                yAxisId="ratio"
                orientation="right"
                stroke={RATIO_AXIS_COLOR}
                tick={{ fill: RATIO_AXIS_COLOR, fontSize: 11 }}
                domain={['auto', 'auto']}
                tickFormatter={formatRatioLabel}
              />
              <Tooltip
                cursor={{ stroke: '#4B5563', strokeWidth: 1 }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const data = payload[0]?.payload as
                    | RelativeStrengthPoint
                    | undefined;
                  const cross = crossPoints.find(
                    (cp) => cp.snapshot_date === label,
                  );
                  return (
                    <div className="rounded-xl border border-gray-700 bg-gray-900 px-4 py-3 shadow-xl">
                      <p className="mb-2 text-xs font-bold text-gray-400">
                        {label}
                      </p>
                      <p className="text-sm text-emerald-300">
                        ETH/BTC Ratio: {formatRatioValue(data?.ratio)}
                      </p>
                      <p className="text-sm text-amber-300">
                        Ratio 200 DMA: {formatRatioValue(data?.dma_200)}
                      </p>
                      {cross ? (
                        <p
                          className={`mt-2 text-xs font-semibold ${cross.direction === 'above' ? 'text-emerald-400' : 'text-amber-400'}`}
                        >
                          {cross.direction === 'above' ? '\u2B06' : '\u2B07'}{' '}
                          ETH crosses {cross.direction} DMA200
                        </p>
                      ) : null}
                    </div>
                  );
                }}
              />
              <Legend
                verticalAlign="top"
                height={32}
                iconType="circle"
                wrapperStyle={{ paddingTop: '0', marginBottom: '10px' }}
              />
              <Line
                yAxisId="ratio"
                type="monotone"
                name="ETH/BTC Ratio"
                dataKey="ratio"
                stroke="#34D399"
                strokeWidth={2.5}
                dot={false}
                connectNulls
              />
              <Line
                yAxisId="ratio"
                type="monotone"
                name="Ratio 200 DMA"
                dataKey="dma_200"
                stroke="#F59E0B"
                strokeWidth={2}
                dot={false}
                strokeDasharray="5 5"
                connectNulls
              />
              {crossPoints.map((cp) => (
                <ReferenceDot
                  key={cp.snapshot_date}
                  yAxisId="ratio"
                  x={cp.snapshot_date}
                  y={cp.ratio}
                  r={6}
                  fill={cp.direction === 'above' ? '#34D399' : '#F59E0B'}
                  stroke="#fff"
                  strokeWidth={2}
                  ifOverflow="extendDomain"
                />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
          <SimpleStatCard
            label="Current ETH/BTC Ratio"
            value={formatRatioValue(latestRelativeStrengthPoint?.ratio)}
            valueClass="text-emerald-300"
            detail="ETH price divided by BTC price on the latest overlapping day."
          />
          <SimpleStatCard
            label="Ratio 200 DMA"
            value={formatRatioValue(latestRelativeStrengthPoint?.dma_200)}
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
    </section>
  );
}
