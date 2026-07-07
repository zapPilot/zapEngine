'use client';

import { useEffect, useState } from 'react';
import { ALLOCATION_PILLARS } from '@/config/allocation';
import { AllocationBar } from '@/components/primitives/AllocationBar';
import { Sparkline } from '@/components/primitives/Sparkline';

/**
 * HeroAccountCard — the terminal state of the hero storyboard.
 *
 * The liquid-metal canvas pours behind this card; the card then settles into
 * the exact composition of the app's Home screen: net worth (Instrument
 * Serif 54/58), balance-trend sparkline (gold), and the three-pillar
 * AllocationBar. Every ~8s a "rebalance pulse" re-distributes the segment
 * weights with the shared primary easing plus a specular sweep — one engine
 * rebalance, replayed forever.
 *
 * Pure DOM + CSS, so it doubles as the reduced-motion / no-WebGL fallback:
 * the account stays legible even if the canvas never boots.
 */

const NET_WORTH_USD = 128540.22;
const CHANGE_PCT = '+2.4%';
const CHANGE_USD = '+$3,012 today';

const SPARKLINE_DATA = [
  100, 101.8, 100.9, 103.4, 102.2, 105.1, 104.3, 107.9, 106.6, 109.4, 111.2,
  110.1, 113.6, 115.2, 114.3, 117.8,
];

/** Rebalance states cycled by the idle loop (weights sum to 100). */
const REBALANCE_STATES: ReadonlyArray<readonly number[]> = [
  [42, 38, 20],
  [36, 34, 30],
  [46, 40, 14],
];

const INITIAL_WEIGHTS = REBALANCE_STATES[0] ?? [42, 38, 20];

const REBALANCE_INTERVAL_MS = 8000;
const SWEEP_DURATION_MS = 1500;
const COUNT_UP_DELAY_MS = 1100;
const COUNT_UP_DURATION_MS = 1400;

function formatUsdParts(value: number): [string, string] {
  const formatted = value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const [integer = '0', fraction = '00'] = formatted.split('.');
  return [integer, fraction];
}

export function HeroAccountCard() {
  const [displayValue, setDisplayValue] = useState(NET_WORTH_USD);
  const [weights, setWeights] = useState(INITIAL_WEIGHTS);
  const [pulsing, setPulsing] = useState(false);

  useEffect(() => {
    const reduceMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) {
      return undefined;
    }

    // Act ③ — account reveal: net worth counts up while the card settles.
    let frame = 0;
    const startedAt = performance.now();
    setDisplayValue(0);
    const tick = (now: number) => {
      const t = Math.min(
        1,
        Math.max(
          0,
          (now - startedAt - COUNT_UP_DELAY_MS) / COUNT_UP_DURATION_MS,
        ),
      );
      const eased = 1 - (1 - t) ** 3;
      setDisplayValue(NET_WORTH_USD * eased);
      if (t < 1) {
        frame = requestAnimationFrame(tick);
      }
    };
    frame = requestAnimationFrame(tick);

    // Act ④ — rebalance pulse: weights shift, a specular sweep crosses the
    // card. Cadence mirrors the plan's ~8s idle loop.
    let stateIndex = 0;
    let sweepTimer: ReturnType<typeof setTimeout> | undefined;
    const loop = setInterval(() => {
      stateIndex = (stateIndex + 1) % REBALANCE_STATES.length;
      setWeights(REBALANCE_STATES[stateIndex] ?? INITIAL_WEIGHTS);
      setPulsing(true);
      sweepTimer = setTimeout(() => setPulsing(false), SWEEP_DURATION_MS);
    }, REBALANCE_INTERVAL_MS);

    return () => {
      cancelAnimationFrame(frame);
      clearInterval(loop);
      if (sweepTimer) {
        clearTimeout(sweepTimer);
      }
    };
  }, []);

  const [integerPart, fractionPart] = formatUsdParts(displayValue);

  return (
    <div
      className={pulsing ? 'account-card pulse' : 'account-card'}
      aria-label="Zap Pilot account preview"
    >
      <div className="account-card-top">
        <span className="account-kicker">Net worth</span>
        <span className="account-chip">
          <span className="account-chip-dot" aria-hidden />
          live · mainnet
        </span>
      </div>

      <div className="account-value">
        <span>${integerPart}</span>
        <span className="account-fraction">.{fractionPart}</span>
      </div>

      <div className="account-delta">
        <span className="account-delta-pill">{CHANGE_PCT}</span>
        <span className="account-delta-sub">{CHANGE_USD}</span>
      </div>

      <div className="account-spark">
        <Sparkline
          data={SPARKLINE_DATA}
          height={54}
          gradientId="hero-account-spark"
          animated
        />
      </div>

      <AllocationBar
        className="account-alloc"
        segments={ALLOCATION_PILLARS.map((pillar, index) => ({
          color: `var(--${pillar.key})`,
          value: weights[index] ?? 0,
        }))}
      />

      <div className="account-legend">
        {ALLOCATION_PILLARS.map((pillar, index) => (
          <div className="account-legend-item" key={pillar.key}>
            <span
              className="account-legend-dot"
              style={{ background: `var(--${pillar.key})` }}
              aria-hidden
            />
            <span className="account-legend-name">{pillar.label}</span>
            <span className="account-legend-weight">
              {weights[index] ?? 0}%
            </span>
          </div>
        ))}
      </div>

      <div className="account-sweep" aria-hidden />

      <p className="account-note">
        Demo preview · same layout as the app&apos;s Home screen
      </p>
    </div>
  );
}
