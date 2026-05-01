import { CHART_SIGNALS, type SignalKey } from '../utils/chartHelpers';

export type IndicatorKey =
  | 'btcPrice'
  | 'dma200'
  | 'macroFearGreed'
  | 'sentiment';

export interface LegendItem {
  label: string;
  color: string;
}

export interface IndicatorLegendItem extends LegendItem {
  key: IndicatorKey;
}

const EVENT_LEGEND_KEYS: SignalKey[] = [
  'buy_spot',
  'sell_spot',
  'switch_to_eth',
  'switch_to_btc',
];

export const INDICATOR_LEGEND: IndicatorLegendItem[] = [
  { key: 'btcPrice', label: 'BTC Price', color: '#3b82f6' },
  { key: 'dma200', label: 'DMA 200', color: '#f59e0b' },
  { key: 'sentiment', label: 'Sentiment', color: '#a855f7' },
  { key: 'macroFearGreed', label: 'Macro FGI', color: '#14b8a6' },
];

/** Event subset shown in the chart legend (excludes borrow/repay/liquidate). */
export const EVENT_LEGEND: LegendItem[] = EVENT_LEGEND_KEYS.flatMap((key) => {
  const signal = CHART_SIGNALS.find((config) => config.key === key);
  return signal ? [{ label: signal.name, color: signal.color }] : [];
});
