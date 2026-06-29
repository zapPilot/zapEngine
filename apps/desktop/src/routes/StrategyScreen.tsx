import { ArrowRight, Info, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { AllocationBar } from '@/components/charts/AllocationBar';
import { Sparkline } from '@/components/charts/Sparkline';
import { MetricsGrid } from '@/components/metrics/MetricsGrid';
import { Card } from '@/components/ui/Card';
import { Pill } from '@/components/ui/Pill';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { RangeTabs } from '@/components/ui/RangeTabs';
import { DEMO } from '@/data/demo';
import { useAccount } from '@/integration/useAccount';
import { useStrategyData } from '@/integration/useStrategyData';

const RANGE_OPTIONS = ['3M', '6M', '1Y', 'ALL'] as const;
export type StrategyRange = (typeof RANGE_OPTIONS)[number];

export function strategyBacktestDaysForRange(
  range: StrategyRange,
): number | undefined {
  if (range === '3M') return 90;
  if (range === '6M') return 180;
  if (range === '1Y') return 365;
  return undefined;
}

const CHART_LEGEND = [
  { label: 'Zap', color: '#d4c5a3', textClass: 'text-[#cfcabb]' },
  { label: 'BTC', color: '#f7931a', textClass: 'text-[#8a857a]' },
  { label: 'ETH', color: '#d7dde7', textClass: 'text-[#8a857a]' },
  { label: 'Stables', color: '#2775ca', textClass: 'text-[#8a857a]' },
] as const;

/** Strategy — backtest chart, metrics grid, fear/greed adaptation. */
export function StrategyScreen() {
  const navigate = useNavigate();
  const [range, setRange] = useState<StrategyRange>('1Y');
  const { isConnected, userId } = useAccount();
  const { data, isLoading, isError } = useStrategyData(
    userId,
    isConnected,
    strategyBacktestDaysForRange(range),
  );

  // The container hook always returns a fully-shaped strategy slice (real where
  // available, demo elsewhere). While identity/data resolve we keep the exact
  // layout and only soften the headline return into a calm dash.
  const strategy = data ?? DEMO.strategy;
  const { backtest } = strategy;
  const pending = isLoading || isError || data === null;
  const returnLabel = pending ? '—' : backtest.returnLabel;
  const isDemo = !isConnected;
  const sentimentMarker =
    typeof backtest.sentiment === 'number' ? backtest.sentiment : 50;
  const hasTargetAllocation = data?.hasTargetAllocation ?? isDemo;
  const liveChartData = data?.backtest.chartData ?? [];

  return (
    <div className="font-sans text-ink" data-screen="strategy">
      {/* Header */}
      <div className="flex items-start justify-between px-5 pt-2">
        <div>
          <h1 className="font-serif text-[27px] leading-none">Zap Strategy</h1>
          <div className="mt-1.5 font-mono text-[9px] uppercase tracking-[0.11em] text-[#9a8f78]">
            Disciplined Portfolio Autopilot
          </div>
        </div>
        <button
          type="button"
          aria-label="Strategy info"
          className="zp-tap grid h-[34px] w-[34px] place-items-center rounded-full border border-line"
          style={{ background: 'rgba(255,255,255,.05)' }}
        >
          <Info size={17} strokeWidth={1.8} className="text-ink-dim" />
        </button>
      </div>

      {/* Backtest + range tabs */}
      <div className="mx-5 mt-5 flex items-center justify-between">
        <span className="text-[14px] font-semibold">Backtest</span>
        <RangeTabs
          options={RANGE_OPTIONS}
          value={range}
          onChange={(value) => setRange(value as StrategyRange)}
        />
      </div>

      {/* Chart card */}
      <Card className="mx-5 mt-3 rounded-[18px] px-[14px] pb-3 pt-[15px]">
        <div className="flex items-end justify-between">
          <div>
            <div className="font-mono text-[9px] tracking-[0.1em] text-[#9a8f78]">
              {isDemo ? 'ZAP STRATEGY · 1Y RETURN' : 'DEFAULT BACKTEST · ROI'}
            </div>
            <div className="mt-0.5 font-serif text-[30px] leading-[1.05] text-success">
              {returnLabel}
            </div>
          </div>
          <div className="text-right font-mono text-[9px] leading-[1.6] text-[#6f6a5f]">
            {backtest.vsBtcLabel}
            <br />
            {backtest.vsEthLabel}
          </div>
        </div>

        {/* Legend */}
        {isDemo ? (
          <div className="mt-[11px] flex flex-wrap gap-[11px]">
            {CHART_LEGEND.map((item) => (
              <span
                key={item.label}
                className={`inline-flex items-center gap-[5px] font-mono text-[9.5px] ${item.textClass}`}
              >
                <span
                  aria-hidden="true"
                  className="h-[3px] w-[13px] rounded-sm"
                  style={{ background: item.color }}
                />
                {item.label}
              </span>
            ))}
          </div>
        ) : null}

        {isDemo ? (
          <svg
            width="100%"
            height="180"
            viewBox="0 0 340 180"
            className="mt-2 block"
            role="img"
            aria-label="Zap Strategy backtest performance versus BTC, ETH and stables over one year"
          >
            <defs>
              <linearGradient id="btArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="rgba(212,197,163,.28)" />
                <stop offset="1" stopColor="rgba(212,197,163,0)" />
              </linearGradient>
            </defs>
            <line
              x1="40"
              y1="28"
              x2="330"
              y2="28"
              stroke="rgba(255,255,255,.05)"
            />
            <line
              x1="40"
              y1="68"
              x2="330"
              y2="68"
              stroke="rgba(255,255,255,.05)"
            />
            <line
              x1="40"
              y1="108"
              x2="330"
              y2="108"
              stroke="rgba(255,255,255,.05)"
            />
            <line
              x1="40"
              y1="148"
              x2="330"
              y2="148"
              stroke="rgba(255,255,255,.05)"
            />
            <text
              x="6"
              y="31"
              fontFamily="JetBrains Mono,monospace"
              fontSize="8"
              fill="#52525b"
            >
              $32k
            </text>
            <text
              x="6"
              y="71"
              fontFamily="JetBrains Mono,monospace"
              fontSize="8"
              fill="#52525b"
            >
              $24k
            </text>
            <text
              x="6"
              y="111"
              fontFamily="JetBrains Mono,monospace"
              fontSize="8"
              fill="#52525b"
            >
              $16k
            </text>
            <text
              x="6"
              y="151"
              fontFamily="JetBrains Mono,monospace"
              fontSize="8"
              fill="#52525b"
            >
              $10k
            </text>
            <path
              d="M40,128 L64,124 L88,126 L112,116 L136,118 L160,104 L184,107 L208,90 L232,93 L256,74 L280,66 L304,52 L326,40 L326,156 L40,156 Z"
              fill="url(#btArea)"
            />
            <path
              d="M40,146 L64,145 L88,145 L112,144 L136,144 L160,143 L184,142 L208,142 L232,141 L256,140 L280,140 L304,138 L326,137"
              fill="none"
              stroke="#2775ca"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity=".8"
            />
            <path
              d="M40,138 L64,136 L88,134 L112,130 L136,132 L160,122 L184,124 L208,114 L232,116 L256,104 L280,108 L304,96 L326,94"
              fill="none"
              stroke="#d7dde7"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity=".75"
            />
            <path
              d="M40,134 L64,130 L88,140 L112,124 L136,144 L160,108 L184,126 L208,80 L232,102 L256,66 L280,86 L304,58 L326,62"
              fill="none"
              stroke="#f7931a"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity=".8"
            />
            <path
              d="M40,128 L64,124 L88,126 L112,116 L136,118 L160,104 L184,107 L208,90 L232,93 L256,74 L280,66 L304,52 L326,40"
              fill="none"
              stroke="#d4c5a3"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="326" cy="40" r="3.2" fill="#d4c5a3" />
            <text
              x="40"
              y="172"
              fontFamily="JetBrains Mono,monospace"
              fontSize="8"
              fill="#52525b"
            >
              Jul
            </text>
            <text
              x="98"
              y="172"
              fontFamily="JetBrains Mono,monospace"
              fontSize="8"
              fill="#52525b"
            >
              Sep
            </text>
            <text
              x="156"
              y="172"
              fontFamily="JetBrains Mono,monospace"
              fontSize="8"
              fill="#52525b"
            >
              Nov
            </text>
            <text
              x="214"
              y="172"
              fontFamily="JetBrains Mono,monospace"
              fontSize="8"
              fill="#52525b"
            >
              Jan
            </text>
            <text
              x="268"
              y="172"
              fontFamily="JetBrains Mono,monospace"
              fontSize="8"
              fill="#52525b"
            >
              Mar
            </text>
            <text
              x="312"
              y="172"
              fontFamily="JetBrains Mono,monospace"
              fontSize="8"
              fill="#52525b"
            >
              Jun
            </text>
          </svg>
        ) : liveChartData.length >= 2 ? (
          <div
            className="mt-2 h-[180px]"
            role="img"
            aria-label="Default strategy backtest value over the selected range"
          >
            <Sparkline
              data={liveChartData}
              height={176}
              gradientId="strategyBacktestSpark"
            />
          </div>
        ) : (
          <div className="grid h-[180px] place-items-center">
            <div className="text-center">
              <div className="font-mono text-[20px] text-ink-faint">—</div>
              <div className="mt-1 text-[11px] text-[#6f6a5f]">
                Default backtest metrics are shown below when available.
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Metrics grid */}
      <MetricsGrid className="mx-5 mt-[18px]" metrics={backtest.metrics} />

      {/* How it adapts */}
      <div className="mx-5 mt-6">
        <div className="text-[15px] font-semibold">How it adapts</div>
        <p className="mt-[5px] text-[12px] leading-[1.5] text-[#8a857a]">
          The strategy shifts weight across three pillars as market conditions
          change — automatically, with no inputs from you.
        </p>

        {/* Fear → greed gradient bar */}
        <div
          className="relative mt-[14px] rounded-full"
          style={{
            height: 8,
            background:
              'linear-gradient(90deg,rgba(122,216,143,.55),rgba(212,197,163,.5),rgba(255,111,97,.55))',
          }}
        >
          <div
            aria-hidden="true"
            className="absolute top-1/2 rounded-full"
            style={{
              left: `${sentimentMarker}%`,
              transform: 'translate(-50%,-50%)',
              width: 15,
              height: 15,
              background: '#f4f4f5',
              border: '3px solid #0a0a0a',
              boxShadow: '0 0 0 1px rgba(255,255,255,.25)',
            }}
          />
        </div>
        <div className="mt-2 flex justify-between font-mono text-[8.5px] tracking-[0.04em] text-[#6f6a5f]">
          <span>FEAR · ACCUMULATE</span>
          <span>GREED · DEFEND</span>
        </div>

        {/* Current mode card */}
        <Card className="mt-[14px] rounded-2xl px-[15px] py-[14px]">
          <div className="flex items-center justify-between">
            <span className="text-[12.5px] text-ink-dim">Current mode</span>
            <Pill
              className="font-mono text-[10px] text-accent"
              style={{
                background: 'rgba(212,197,163,.12)',
                border: '1px solid rgba(212,197,163,.25)',
              }}
            >
              {backtest.currentModeLabel}
            </Pill>
          </div>
          <AllocationBar
            className="mt-3"
            height={9}
            segments={backtest.allocation.map((a) => ({
              color: a.color,
              value: a.pct,
            }))}
          />
          <div className="mt-2 flex justify-between font-mono text-[9px] text-[#6f6a5f]">
            {backtest.allocation.map((a) => (
              <span key={a.label}>
                {a.label} {hasTargetAllocation ? `${a.pct}%` : '—'}
              </span>
            ))}
          </div>
        </Card>
      </div>

      {/* Disclaimer */}
      <Card
        className="mx-5 mt-[18px] flex gap-2.5 rounded-2xl px-[14px] py-[13px]"
        style={{ background: 'rgba(255,255,255,.02)' }}
      >
        <TriangleAlert
          size={17}
          strokeWidth={1.8}
          className="mt-px shrink-0 text-[#6f6a5f]"
          aria-hidden="true"
        />
        <p className="text-[11px] leading-[1.55] text-[#7d7868]">
          {isDemo
            ? "Backtested on historical data. Past performance doesn't guarantee future results — only invest what you're comfortable holding."
            : 'Default backtest metrics come from analytics when available. Target allocation uses the latest strategy suggestion.'}
        </p>
      </Card>

      {/* CTA */}
      <div className="px-5 pt-[18px]">
        <PrimaryButton onClick={() => navigate('/invest/amount')}>
          Start with Zap Strategy
          <ArrowRight size={17} strokeWidth={2.4} aria-hidden="true" />
        </PrimaryButton>
      </div>
    </div>
  );
}
