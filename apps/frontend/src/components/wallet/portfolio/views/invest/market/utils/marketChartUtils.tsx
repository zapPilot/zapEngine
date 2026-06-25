import {
  getRegimeColor,
  getRegimeLabel,
} from '@zapengine/app-core/lib/domain/regime';
import type { MarketDashboardPoint } from '@zapengine/app-core/services';
import type { JSX, ReactNode } from 'react';
import type { TooltipPayloadEntry, TooltipValueType } from 'recharts';

import { MARKET_LINES } from '../sections/marketDashboardConstants';

export function getBaseAssets(d: MarketDashboardPoint) {
  return {
    btc: d.values['btc'],
    eth: d.values['eth'],
    spy: d.values['spy'],
  };
}

function getMinMax(arr: number[]): { min: number; max: number } {
  if (arr.length === 0) return { min: 0, max: 1 };
  const min = Math.min(...arr);
  const max = Math.max(...arr);
  if (max === min) return { min, max: max + 1 };
  return { min, max };
}

export function normalize(
  v: number | null,
  min: number,
  max: number,
): number | null {
  if (v == null) return null;
  return ((v - min) / (max - min)) * 100;
}

export function collectAssetRanges(data: MarketDashboardPoint[]): {
  btcMinMax: { min: number; max: number };
  ethMinMax: { min: number; max: number };
  sp500MinMax: { min: number; max: number };
} {
  const btcValues: number[] = [];
  const ethValues: number[] = [];
  const sp500Values: number[] = [];

  for (const d of data) {
    const { btc, eth, spy } = getBaseAssets(d);
    if (btc?.value != null) btcValues.push(btc.value);
    const btcDma = btc?.indicators?.['dma_200']?.value;
    if (btcDma != null) btcValues.push(btcDma);
    if (eth?.value != null) ethValues.push(eth.value);
    const ethDma = eth?.indicators?.['dma_200']?.value;
    if (ethDma != null) ethValues.push(ethDma);
    if (spy?.value != null) sp500Values.push(spy.value);
    const spyDma = spy?.indicators?.['dma_200']?.value;
    if (spyDma != null) sp500Values.push(spyDma);
  }

  return {
    btcMinMax: getMinMax(btcValues),
    ethMinMax: getMinMax(ethValues),
    sp500MinMax: getMinMax(sp500Values),
  };
}

const DOLLAR_FORMAT_LABELS: Record<string, string> = Object.fromEntries(
  MARKET_LINES.flatMap((line) =>
    line.axis === 'price' && line.rawField != null
      ? [[line.label, line.rawField]]
      : [],
  ),
);

interface ChartPayloadRow {
  sentiment_value?: number | null;
  macro_fear_greed?: number | null;
  regime?: string | null;
  macro_regime?: string | null;
  [key: string]: unknown;
}

export function formatTooltipValue(
  value: TooltipValueType | undefined,
  name: string | number | undefined,
  item: TooltipPayloadEntry,
): [ReactNode, string | number] {
  const labelName = String(name ?? '');
  const payload = item.payload as ChartPayloadRow | undefined;

  const dollarField = DOLLAR_FORMAT_LABELS[labelName];
  if (dollarField != null) {
    const rawValue = payload?.[dollarField];
    const num =
      typeof rawValue === 'number' && Number.isFinite(rawValue)
        ? rawValue
        : null;
    return [num != null ? `$${num.toLocaleString()}` : '---', labelName];
  }

  if (labelName === 'ETH/BTC Ratio' || labelName === 'ETH/BTC 200 DMA') {
    return [Number(value ?? 0).toFixed(4), labelName];
  }
  if (labelName === 'Fear & Greed Index') {
    const rawFgi = payload?.sentiment_value;
    const regimeLabel = getRegimeLabel(payload?.regime);
    return [`${String(rawFgi)} (${regimeLabel})`, labelName];
  }
  if (labelName === 'Macro FGI') {
    const rawFgi = payload?.macro_fear_greed;
    const regimeLabel = getRegimeLabel(payload?.macro_regime);
    return [`${String(rawFgi)} (${regimeLabel})`, labelName];
  }
  return [value as string | number, labelName];
}

interface RegimeRow {
  regime: string | null;
  macro_regime: string | null;
}

export function createGradientStops(
  chartData: RegimeRow[],
  getRegime: (d: RegimeRow) => string | null,
): JSX.Element[] {
  return chartData.map((d, i) => {
    const offset = chartData.length > 1 ? i / (chartData.length - 1) : 0;
    const color = getRegimeColor(getRegime(d));
    return (
      <stop
        key={i}
        offset={`${(offset * 100).toFixed(2)}%`}
        stopColor={color}
      />
    );
  });
}

export function makeRegimeActiveDot(regimeField: 'regime' | 'macro_regime') {
  return function renderActiveDot(dotProps: {
    cx?: number | undefined;
    cy?: number | undefined;
    payload?: Record<string, unknown>;
  }): JSX.Element {
    const { cx = 0, cy = 0, payload } = dotProps;
    const color = getRegimeColor(
      payload?.[regimeField] as string | null | undefined,
      '#10B981',
    );
    return (
      <circle
        cx={cx}
        cy={cy}
        r={6}
        fill={color}
        stroke="#fff"
        strokeWidth={2}
      />
    );
  };
}
