import { type JSX, useMemo } from 'react';
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { REGIME_LABELS } from '@/lib/domain/regimeMapper';
import type { MarketDashboardPoint } from '@/services';
import { formatCurrencyAxis } from '@/utils';

import {
  AXIS_COLOR,
  DEFAULT_ACTIVE_LINES,
  formatXAxisDate,
  getRegimeColor,
  type MarketLineKey,
  REGIME_COLORS,
} from './sections/marketDashboardConstants';

type RegimeKey = keyof typeof REGIME_COLORS;

/**
 * Flat row shape consumed by recharts. Source `MarketDashboardPoint` has BTC
 * DMA as `dma_200` and ETH/BTC DMA nested under `eth_btc_relative_strength`,
 * so we flatten and disambiguate (`btc_dma_200` vs `eth_btc_dma_200`) before
 * handing the array to recharts — `<Line dataKey>` references these names.
 */
interface ChartDataPoint {
  snapshot_date: string;
  price_usd: number;
  btc_dma_200: number | null;
  eth_btc_ratio: number | null;
  eth_btc_dma_200: number | null;
  sentiment_value: number | null;
  regime: string | null;
}

interface MarketOverviewChartProps {
  data: MarketDashboardPoint[];
  activeLines?: ReadonlySet<MarketLineKey>;
}

interface TooltipPayload {
  payload?: {
    sentiment_value?: number | null;
    regime?: string | null;
    btc_dma_200?: number | null;
    eth_btc_ratio?: number | null;
    eth_btc_dma_200?: number | null;
  };
}

/**
 * Recharts' `Tooltip.formatter` types `name` as `string | number | undefined`.
 * The chart only emits string names, but we keep the wider parameter type so
 * the function is assignable to the prop without a cast.
 */
function formatTooltipValue(
  value: string | number | readonly (string | number)[] | undefined,
  name: string | number | undefined,
  props: TooltipPayload,
): [string | number, string | number] {
  const labelName = String(name ?? '');
  if (labelName === 'BTC Price' || labelName === 'BTC 200 DMA') {
    return [`$${Number(value ?? 0).toLocaleString()}`, labelName];
  }
  if (labelName === 'ETH/BTC Ratio' || labelName === 'ETH/BTC 200 DMA') {
    return [Number(value ?? 0).toFixed(4), labelName];
  }
  if (labelName === 'Fear & Greed Index') {
    const rawFgi = props.payload?.sentiment_value;
    const regime = props.payload?.regime as
      | keyof typeof REGIME_LABELS
      | undefined;
    const label = regime ? REGIME_LABELS[regime] : '';
    return [`${String(rawFgi)} (${label})`, labelName];
  }
  return [value as string | number, labelName];
}

function renderFgiActiveDot(dotProps: {
  cx?: number | undefined;
  cy?: number | undefined;
  payload?: { regime?: string | null | undefined };
}): JSX.Element {
  const { cx = 0, cy = 0, payload } = dotProps;
  const color = getRegimeColor(payload?.regime, '#10B981');
  return (
    <circle cx={cx} cy={cy} r={6} fill={color} stroke="#fff" strokeWidth={2} />
  );
}

export function MarketOverviewChart({
  data,
  activeLines = DEFAULT_ACTIVE_LINES,
}: MarketOverviewChartProps): JSX.Element {
  const chartData = useMemo<ChartDataPoint[]>(
    () =>
      data.map((d) => ({
        snapshot_date: d.snapshot_date,
        price_usd: d.price_usd,
        btc_dma_200: d.dma_200,
        eth_btc_ratio: d.eth_btc_relative_strength?.ratio ?? null,
        eth_btc_dma_200: d.eth_btc_relative_strength?.dma_200 ?? null,
        sentiment_value: d.sentiment_value,
        regime: d.regime,
      })),
    [data],
  );

  const regimeBlocks = useMemo(() => {
    if (!chartData.length) return [];

    const blocks: {
      start: string;
      end: string;
      regime: RegimeKey;
    }[] = [];
    let currentBlock: {
      start: string;
      end: string;
      regime: RegimeKey;
    } | null = null;

    for (const [i, d] of chartData.entries()) {
      const regime = (d.regime || 'n') as RegimeKey;

      if (!currentBlock) {
        currentBlock = { start: d.snapshot_date, end: d.snapshot_date, regime };
      } else if (currentBlock.regime === regime) {
        currentBlock.end = d.snapshot_date;
      } else {
        blocks.push(currentBlock);
        currentBlock = { start: d.snapshot_date, end: d.snapshot_date, regime };
      }

      if (i === chartData.length - 1) {
        blocks.push(currentBlock);
      }
    }

    return blocks;
  }, [chartData]);

  const showBtcPrice = activeLines.has('btcPrice');
  const showBtcDma200 = activeLines.has('btcDma200');
  const showEthBtcRatio = activeLines.has('ethBtcRatio');
  const showEthBtcDma200 = activeLines.has('ethBtcDma200');
  const showFgi = activeLines.has('fgi');
  // The price axis hosts both BTC lines; render it whenever either is on so
  // the lines have a scale to render against. Same logic for the ratio axis.
  const showPriceAxis = showBtcPrice || showBtcDma200;
  const showRatioAxis = showEthBtcRatio || showEthBtcDma200;

  return (
    <div className="w-full h-[540px] mt-4 relative">
      <div className="absolute bottom-[68px] left-[72px] z-10">
        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
          Market Sentiment Regime
        </span>
      </div>

      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={chartData}
          margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
        >
          <defs>
            <linearGradient id="colorFgi" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="fgiLineGradient" x1="0" y1="0" x2="1" y2="0">
              {chartData.map((d, i) => {
                const offset =
                  chartData.length > 1 ? i / (chartData.length - 1) : 0;
                const color = getRegimeColor(d.regime);
                return (
                  <stop
                    key={i}
                    offset={`${(offset * 100).toFixed(2)}%`}
                    stopColor={color}
                  />
                );
              })}
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="#374151"
            vertical={false}
          />
          <XAxis
            dataKey="snapshot_date"
            stroke={AXIS_COLOR}
            tick={{ fill: AXIS_COLOR, fontSize: 11 }}
            tickMargin={35}
            minTickGap={40}
            tickFormatter={formatXAxisDate}
          />

          {showPriceAxis && (
            <YAxis
              yAxisId="price"
              stroke={AXIS_COLOR}
              tick={{ fill: AXIS_COLOR, fontSize: 11 }}
              domain={['auto', 'auto']}
              tickFormatter={formatCurrencyAxis}
            />
          )}

          {showRatioAxis && (
            <YAxis
              yAxisId="ratio"
              orientation="right"
              stroke="#34D399"
              tick={{ fill: '#34D399', fontSize: 11 }}
              domain={['auto', 'auto']}
              tickFormatter={(v) => Number(v).toFixed(4)}
              label={{
                value: 'ETH/BTC',
                angle: 90,
                position: 'insideRight',
                fill: '#34D399',
                fontSize: 10,
              }}
            />
          )}

          {showFgi && (
            <YAxis
              yAxisId="fgi"
              orientation="right"
              stroke="#10B981"
              tick={{ fill: '#10B981', fontSize: 11 }}
              domain={[0, 100]}
              tickFormatter={String}
              label={{
                value: 'FGI',
                angle: 90,
                position: 'insideRight',
                fill: '#10B981',
                fontSize: 10,
              }}
            />
          )}

          <YAxis yAxisId="ribbon" hide={true} domain={[0, 100]} />

          {regimeBlocks.map((block, idx) => (
            <ReferenceArea
              key={`ribbon-${idx}`}
              yAxisId="ribbon"
              x1={block.start}
              x2={block.end}
              y1={0}
              y2={8}
              fill={REGIME_COLORS[block.regime]}
              fillOpacity={0.9}
              stroke="none"
            />
          ))}

          <Tooltip
            contentStyle={{
              backgroundColor: '#111827',
              borderColor: '#374151',
              borderRadius: '12px',
              color: '#fff',
              boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)',
            }}
            itemStyle={{ color: '#E5E7EB', fontSize: '13px' }}
            labelStyle={{
              color: AXIS_COLOR,
              marginBottom: '8px',
              fontWeight: 'bold',
            }}
            cursor={{ stroke: '#4B5563', strokeWidth: 1 }}
            formatter={formatTooltipValue}
          />

          {showBtcPrice && (
            <Line
              yAxisId="price"
              type="monotone"
              name="BTC Price"
              dataKey="price_usd"
              stroke={AXIS_COLOR}
              strokeWidth={2}
              dot={false}
              activeDot={{
                r: 5,
                fill: AXIS_COLOR,
                strokeWidth: 2,
                stroke: '#fff',
              }}
            />
          )}

          {showBtcDma200 && (
            <Line
              yAxisId="price"
              type="monotone"
              name="BTC 200 DMA"
              dataKey="btc_dma_200"
              stroke="#A855F7"
              strokeWidth={2}
              dot={false}
              strokeDasharray="5 5"
              connectNulls
            />
          )}

          {showEthBtcRatio && (
            <Line
              yAxisId="ratio"
              type="monotone"
              name="ETH/BTC Ratio"
              dataKey="eth_btc_ratio"
              stroke="#34D399"
              strokeWidth={2}
              dot={false}
              connectNulls
            />
          )}

          {showEthBtcDma200 && (
            <Line
              yAxisId="ratio"
              type="monotone"
              name="ETH/BTC 200 DMA"
              dataKey="eth_btc_dma_200"
              stroke="#F59E0B"
              strokeWidth={2}
              dot={false}
              strokeDasharray="5 5"
              connectNulls
            />
          )}

          {showFgi && (
            <Line
              yAxisId="fgi"
              type="monotone"
              name="Fear & Greed Index"
              dataKey="sentiment_value"
              stroke="url(#fgiLineGradient)"
              strokeWidth={2.5}
              dot={false}
              connectNulls
              activeDot={renderFgiActiveDot}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
