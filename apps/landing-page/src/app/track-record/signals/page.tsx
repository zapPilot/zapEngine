'use client';

import { ChartEmptyState } from '@/components/track-record/ChartEmptyState';
import { MarketSeriesChart } from '@/components/track-record/MarketSeriesChart';
import { SentimentChart } from '@/components/track-record/SentimentChart';
import {
  gaugeSeries,
  getMarketSignals,
  seriesWithDma,
  signalsAsOf,
  type MarketGaugePoint,
} from '@/data/market-signals';

const CRYPTO_REGIMES: Record<string, string> = {
  ef: 'Extreme Fear',
  f: 'Fear',
  n: 'Neutral',
  g: 'Greed',
  eg: 'Extreme Greed',
};

function displayCryptoRegimes(points: MarketGaugePoint[]): MarketGaugePoint[] {
  return points.map((point) => ({
    ...point,
    regime: point.regime
      ? (CRYPTO_REGIMES[point.regime] ?? point.regime)
      : null,
  }));
}

function displayMacroRegimes(points: MarketGaugePoint[]): MarketGaugePoint[] {
  return points.map((point) => ({
    ...point,
    regime: point.regime
      ? point.regime
          .replaceAll('_', ' ')
          .replace(/\b\w/g, (c) => c.toUpperCase())
      : null,
  }));
}

function dollars(value: number): string {
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(1)}k`;
  return `$${value.toFixed(0)}`;
}

export default function SignalsPage() {
  const signals = getMarketSignals();

  if (!signals) {
    return (
      <div className="track-record-signals">
        <h2>Market Signals</h2>
        <ChartEmptyState
          emptyClassName="market-signals-empty"
          message="Market signals are temporarily unavailable."
        />
      </div>
    );
  }

  return (
    <div className="track-record-signals">
      <h2>Market Signals</h2>
      <p className="signals-meta">
        As of {signalsAsOf(signals)} · 365-day window · regenerated nightly
      </p>
      <p className="signals-note">
        These are live market inputs to the demo strategy, not simulated
        track-record results.
      </p>

      <div className="signals-charts">
        <MarketSeriesChart
          color="var(--event-btc)"
          formatValue={dollars}
          kicker="Crypto trend"
          points={seriesWithDma(signals, 'btc')}
          title="Bitcoin"
          tokenSymbol="BTC"
        />
        <MarketSeriesChart
          color="var(--event-eth)"
          formatValue={dollars}
          kicker="Crypto trend"
          points={seriesWithDma(signals, 'eth')}
          title="Ethereum"
          tokenSymbol="ETH"
        />
        <MarketSeriesChart
          caption="SPY prices are forward-filled across non-trading days."
          color="var(--event-spy)"
          formatValue={dollars}
          kicker="Macro trend"
          points={seriesWithDma(signals, 'spy')}
          title="S&P 500"
          tokenSymbol="SPY"
        />
        <MarketSeriesChart
          caption="ETH price divided by BTC price; higher values indicate relative ETH strength."
          color="var(--event-eth)"
          formatValue={(value) => value.toFixed(4)}
          kicker="Relative strength"
          points={seriesWithDma(signals, 'eth_btc')}
          title="ETH/BTC Ratio"
        />
        <SentimentChart
          caption="Source: Alternative.me Crypto Fear & Greed Index."
          kicker="Crypto sentiment"
          points={displayCryptoRegimes(gaugeSeries(signals, 'fgi'))}
          title="Crypto Fear & Greed"
        />
        <SentimentChart
          caption="Source: CNN Fear & Greed Index."
          kicker="Macro sentiment"
          points={displayMacroRegimes(gaugeSeries(signals, 'macro_fear_greed'))}
          title="Macro Fear & Greed"
        />
      </div>
    </div>
  );
}
