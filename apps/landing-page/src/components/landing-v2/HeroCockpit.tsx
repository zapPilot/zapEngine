'use client';

import { useEffect, useState } from 'react';

export type CockpitRegime = 'greed' | 'neutral' | 'fear';

interface RegimeReadout {
  regimeLabel: string;
  regimeColor: string;
  fgi: string;
  dma: string;
  nextRebal: string;
  bundleAction: string;
}

const REGIME_READOUTS: Record<CockpitRegime, RegimeReadout> = {
  greed: {
    regimeLabel: 'GREED',
    regimeColor: '#f7931a',
    fgi: 'FGI 72',
    dma: '200MA +14.2%',
    nextRebal: '02:14:00',
    bundleAction: 'Trim BTC · ETH → Stablecoins (defensive tilt)',
  },
  neutral: {
    regimeLabel: 'NEUTRAL',
    regimeColor: '#a1a1aa',
    fgi: 'FGI 54',
    dma: '200MA +6.1%',
    nextRebal: '—',
    bundleAction: 'Holding target — no trade due',
  },
  fear: {
    regimeLabel: 'FEAR',
    regimeColor: '#7ad88f',
    fgi: 'FGI 21',
    dma: '200MA −8.4%',
    nextRebal: '00:41:00',
    bundleAction: 'Buy S&P500 + BTC · ETH ← Stablecoins',
  },
};

const NET_WORTH_USD = 128540.22;
const COUNT_UP_DELAY_MS = 300;
const COUNT_UP_DURATION_MS = 1400;
const WEIGHT_CYCLE_MS = 8000;

const PILLARS = [
  { label: 'S&P 500', color: '#d7dde7' },
  { label: 'BTC · ETH', color: '#f7931a' },
  { label: 'Stablecoins', color: '#2775ca' },
] as const;

const INITIAL_WEIGHTS: readonly [number, number, number] = [42, 38, 20];
const WEIGHT_STATES: ReadonlyArray<readonly [number, number, number]> = [
  INITIAL_WEIGHTS,
  [36, 34, 30],
  [46, 40, 14],
];

const SPARK_LINE =
  'M0,57 L34.7,51.5 L69.3,54.3 L104,46.7 L138.7,50.3 L173.3,41.5 L208,44 ' +
  'L242.7,33 L277.3,37 L312,28.5 L346.7,23 L381.3,26.4 L416,15.7 ' +
  'L450.7,10.9 L485.3,13.6 L520,3';
const SPARK_AREA = `${SPARK_LINE} L520,60 L0,60 Z`;

function splitAmount(value: number): { int: string; frac: string } {
  const formatted = value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const dot = formatted.indexOf('.');
  if (dot === -1) {
    return { int: formatted, frac: '00' };
  }
  return { int: formatted.slice(0, dot), frac: formatted.slice(dot + 1) };
}

export function HeroCockpit({ regime = 'greed' }: { regime?: CockpitRegime }) {
  const [net, setNet] = useState(NET_WORTH_USD);
  const [weightIndex, setWeightIndex] = useState(0);

  useEffect(() => {
    if (typeof window.requestAnimationFrame !== 'function') {
      return undefined;
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return undefined;
    }

    setNet(0);
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const t = Math.min(
        1,
        Math.max(0, (now - t0 - COUNT_UP_DELAY_MS) / COUNT_UP_DURATION_MS),
      );
      const eased = 1 - (1 - t) ** 3;
      setNet(NET_WORTH_USD * eased);
      if (t < 1) {
        raf = window.requestAnimationFrame(tick);
      }
    };
    raf = window.requestAnimationFrame(tick);

    const loop = window.setInterval(() => {
      setWeightIndex((index) => (index + 1) % WEIGHT_STATES.length);
    }, WEIGHT_CYCLE_MS);

    return () => {
      window.cancelAnimationFrame(raf);
      window.clearInterval(loop);
    };
  }, []);

  const { int: netInt, frac: netFrac } = splitAmount(net);
  const weights = WEIGHT_STATES[weightIndex] ?? INITIAL_WEIGHTS;
  const readout = REGIME_READOUTS[regime];

  return (
    <div className="zp-cockpit">
      <div className="zp-cockpit-glow" aria-hidden />
      <div
        role="group"
        aria-label="Account cockpit preview"
        className="zp-cockpit-card"
      >
        <div className="zp-cockpit-sweep" aria-hidden />
        <div className="zp-cockpit-head">
          <span className="zp-cockpit-label">Net worth</span>
          <span className="zp-cockpit-live">
            <span className="zp-dot zp-dot-sm" aria-hidden />
            Live · Mainnet
          </span>
        </div>
        <div className="zp-cockpit-networth">
          ${netInt}
          <span className="zp-cockpit-cents">.{netFrac}</span>
        </div>
        <div className="zp-cockpit-delta">
          <span className="zp-pill-green">+2.4%</span>
          <span className="zp-cockpit-delta-sub">+$3,012 today</span>
        </div>
        <svg viewBox="0 0 520 60" className="zp-cockpit-spark" aria-hidden>
          <defs>
            <linearGradient id="zp-spark-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="rgba(212,197,163,0.22)" />
              <stop offset="1" stopColor="rgba(212,197,163,0)" />
            </linearGradient>
          </defs>
          <path d={SPARK_AREA} fill="url(#zp-spark-fill)" />
          <path d={SPARK_LINE} fill="none" stroke="#d4c5a3" strokeWidth={1.6} />
        </svg>
        <div className="zp-alloc-bar" aria-hidden>
          {PILLARS.map((pillar, index) => (
            <span
              key={pillar.label}
              style={{
                width: `${weights[index] ?? 0}%`,
                background: pillar.color,
              }}
            />
          ))}
        </div>
        <div className="zp-alloc-legend">
          {PILLARS.map((pillar, index) => (
            <span key={pillar.label} className="zp-alloc-item">
              <span
                className="zp-alloc-swatch"
                style={{ background: pillar.color }}
                aria-hidden
              />
              {pillar.label} <strong>{weights[index] ?? 0}%</strong>
            </span>
          ))}
        </div>
        <div className="zp-cockpit-telemetry">
          <span>
            Regime ·{' '}
            <strong style={{ color: readout.regimeColor }}>
              {readout.regimeLabel}
            </strong>
          </span>
          <span>{readout.fgi}</span>
          <span>{readout.dma}</span>
          <span>Next rebal · {readout.nextRebal}</span>
        </div>
        <div className="zp-cockpit-bundle">
          <div className="zp-cockpit-bundle-copy">
            <span className="zp-cockpit-bundle-kicker">Pending bundle</span>
            <span className="zp-cockpit-bundle-action">
              {readout.bundleAction}
            </span>
          </div>
          <span className="zp-cockpit-bundle-btn">Review &amp; sign</span>
        </div>
        <p className="zp-cockpit-footnote">
          Nothing moves without this signature
        </p>
      </div>
    </div>
  );
}
