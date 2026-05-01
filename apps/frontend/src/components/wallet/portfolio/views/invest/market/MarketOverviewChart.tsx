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

import {
  AXIS_COLOR,
  DEFAULT_ACTIVE_LINES,
  formatPriceLabel,
  formatXAxisDate,
  getRegimeColor,
  MARKET_LINES,
  type MarketLineKey,
  REGIME_COLORS,
} from './sections/marketDashboardConstants';

type RegimeKey = keyof typeof REGIME_COLORS;

/**
 * Flat row shape consumed by recharts. Source `MarketDashboardPoint` is the
 * self-describing snapshot whose `values` map keys series ids (`btc`, `spy`,
 * `eth_btc`, `fgi`) to `{ value, indicators, tags }`. We flatten + normalize
 * here so `<Line dataKey>` can reference plain field names.
 */
interface ChartDataPoint {
  snapshot_date: string;
  price_usd: number | null;
  btc_dma_200: number | null;
  eth_btc_ratio: number | null;
  eth_btc_dma_200: number | null;
  sp500_price_usd: number | null;
  sp500_dma_200: number | null;
  sentiment_value: number | null;
  macro_fear_greed: number | null;
  regime: string | null;
  macro_fear_greed_label: string | null;
  // Normalized (0-100 scale) - BTC Price + BTC DMA share same scale
  btc_price_normalized: number | null;
  btc_dma_normalized: number | null;
  // Normalized - SPY Price + SPY DMA share same scale
  sp500_price_normalized: number | null;
  sp500_dma_normalized: number | null;
}

interface MarketOverviewChartProps {
  data: MarketDashboardPoint[];
  activeLines?: ReadonlySet<MarketLineKey>;
}

interface TooltipPayload {
  payload?: {
    sentiment_value?: number | null;
    macro_fear_greed?: number | null;
    regime?: string | null;
    macro_fear_greed_label?: string | null;
    btc_dma_200?: number | null;
    eth_btc_ratio?: number | null;
    eth_btc_dma_200?: number | null;
    price_usd?: number | null;
    sp500_price_usd?: number | null;
    sp500_dma_200?: number | null;
  };
}

function toNumeric(
  v: string | number | readonly (string | number)[] | undefined,
): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function getMinMax(arr: number[]): { min: number; max: number } {
  if (arr.length === 0) return { min: 0, max: 1 };
  const min = Math.min(...arr);
  const max = Math.max(...arr);
  if (max === min) return { min, max: max + 1 };
  return { min, max };
}

function normalize(v: number | null, min: number, max: number): number | null {
  if (v == null) return null;
  return ((v - min) / (max - min)) * 100;
}

const DOLLAR_FORMAT_LABELS: Record<string, string> = {
  'BTC Price': 'price_usd',
  'BTC 200 DMA': 'btc_dma_200',
  'SPY Price': 'sp500_price_usd',
  'SPY 200 DMA': 'sp500_dma_200',
};

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
  const payload = props.payload;

  const dollarField = DOLLAR_FORMAT_LABELS[labelName];
  if (dollarField != null) {
    const rawValue =
      (payload as Record<string, unknown>)?.[dollarField] ?? toNumeric(value);
    return [
      rawValue != null ? `$${rawValue.toLocaleString()}` : '$0',
      labelName,
    ];
  }

  if (labelName === 'ETH/BTC Ratio' || labelName === 'ETH/BTC 200 DMA') {
    return [Number(value ?? 0).toFixed(4), labelName];
  }
  if (labelName === 'Fear & Greed Index') {
    const rawFgi = payload?.sentiment_value;
    const regime = payload?.regime as keyof typeof REGIME_LABELS | undefined;
    const regimeLabel = regime ? REGIME_LABELS[regime] : '';
    return [`${String(rawFgi)} (${regimeLabel})`, labelName];
  }
  if (labelName === 'Macro FGI') {
    const rawFgi = payload?.macro_fear_greed;
    const label = payload?.macro_fear_greed_label ?? '';
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
  const chartData = useMemo<ChartDataPoint[]>(() => {
    const btcValues: number[] = [];
    const sp500Values: number[] = [];

    for (const d of data) {
      const btc = d.values['btc'];
      const spy = d.values['spy'];
      if (btc?.value != null) btcValues.push(btc.value);
      const btcDma = btc?.indicators?.['dma_200']?.value;
      if (btcDma != null) btcValues.push(btcDma);
      if (spy?.value != null) sp500Values.push(spy.value);
      const spyDma = spy?.indicators?.['dma_200']?.value;
      if (spyDma != null) sp500Values.push(spyDma);
    }

    const btcMinMax = getMinMax(btcValues);
    const sp500MinMax = getMinMax(sp500Values);

    return data.map((d) => {
      const btc = d.values['btc'];
      const spy = d.values['spy'];
      const ethBtc = d.values['eth_btc'];
      const fgi = d.values['fgi'];
      const macroFearGreed = d.values['macro_fear_greed'];
      const btcPrice = btc?.value ?? null;
      const btcDma = btc?.indicators?.['dma_200']?.value ?? null;
      const spyPrice = spy?.value ?? null;
      const spyDma = spy?.indicators?.['dma_200']?.value ?? null;

      return {
        snapshot_date: d.snapshot_date,
        price_usd: btcPrice,
        btc_dma_200: btcDma,
        eth_btc_ratio: ethBtc?.value ?? null,
        eth_btc_dma_200: ethBtc?.indicators?.['dma_200']?.value ?? null,
        sp500_price_usd: spyPrice,
        sp500_dma_200: spyDma,
        sentiment_value: fgi?.value ?? null,
        macro_fear_greed: macroFearGreed?.value ?? null,
        regime: fgi?.tags?.['regime'] ?? null,
        macro_fear_greed_label:
          macroFearGreed?.tags?.['label'] ??
          macroFearGreed?.tags?.['regime'] ??
          null,
        btc_price_normalized: normalize(btcPrice, btcMinMax.min, btcMinMax.max),
        btc_dma_normalized: normalize(btcDma, btcMinMax.min, btcMinMax.max),
        sp500_price_normalized: normalize(
          spyPrice,
          sp500MinMax.min,
          sp500MinMax.max,
        ),
        sp500_dma_normalized: normalize(
          spyDma,
          sp500MinMax.min,
          sp500MinMax.max,
        ),
      };
    });
  }, [data]);

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

  const showPriceAxis =
    activeLines.has('btcPrice') ||
    activeLines.has('btcDma200') ||
    activeLines.has('spyPrice') ||
    activeLines.has('spyDma200');
  const showRatioAxis =
    activeLines.has('ethBtcRatio') || activeLines.has('ethBtcDma200');
  const showFgi = activeLines.has('fgi') || activeLines.has('macro_fear_greed');

  const activeLineDescriptors = useMemo(
    () => MARKET_LINES.filter((line) => activeLines.has(line.key)),
    [activeLines],
  );

  return (
    <div className="w-full h-[540px] mt-4 relative">
      <div className="absolute bottom-[68px] left-[72px] z-10">
        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
          Market Sentiment Regime
        </span>
      </div>

      {(activeLines.has('spyPrice') || activeLines.has('spyDma200')) && (
        <div className="absolute bottom-[52px] left-[72px] z-10">
          <span className="text-[9px] text-gray-500">
            S&P 500 data shown only for market trading days
          </span>
        </div>
      )}

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
              domain={[0, 100]}
              tickFormatter={formatPriceLabel}
              label={{
                value: 'BTC / SPY',
                angle: -90,
                position: 'insideLeft',
                fill: AXIS_COLOR,
                fontSize: 10,
              }}
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

          {activeLineDescriptors.map((line) => {
            const isFgi = line.key === 'fgi';
            const isMacroFgi = line.key === 'macro_fear_greed';
            const isBtcPrice = line.key === 'btcPrice';

            const strokeDasharrayProps = line.strokeDasharray
              ? { strokeDasharray: line.strokeDasharray }
              : {};
            const activeDotProps = isFgi
              ? { activeDot: renderFgiActiveDot }
              : isBtcPrice
                ? {
                    activeDot: {
                      r: 5,
                      fill: line.color,
                      strokeWidth: 2,
                      stroke: '#fff',
                    },
                  }
                : {};

            return (
              <Line
                key={line.key}
                yAxisId={line.axis}
                type="monotone"
                name={line.label}
                dataKey={line.dataKey}
                stroke={isFgi ? 'url(#fgiLineGradient)' : line.color}
                strokeWidth={isFgi || isMacroFgi ? 2.5 : 2}
                dot={false}
                {...strokeDasharrayProps}
                connectNulls
                {...activeDotProps}
              />
            );
          })}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
