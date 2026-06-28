import { AllocationBar } from '@/components/charts/AllocationBar';
import { MetricsGrid } from '@/components/metrics/MetricsGrid';
import { ArrowGlyph } from '@/components/ui/ArrowGlyph';
import { Card } from '@/components/ui/Card';
import { Pill } from '@/components/ui/Pill';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { ZapLogo } from '@/components/ui/ZapLogo';
import { type HomeData } from '@/integration/useHomeData';

type StrategySlice = HomeData['strategy'];

interface ZapStrategyCardProps {
  strategy: StrategySlice;
  onStart: () => void;
}

function CheckGlyph() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#d4c5a3"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function keyBacktestMetrics(strategy: StrategySlice) {
  const preferred = strategy.backtest.metrics.filter((metric) =>
    ['ROI', 'Max drawdown'].includes(metric.label),
  );
  return preferred.length >= 2
    ? preferred.slice(0, 2)
    : strategy.backtest.metrics.slice(0, 2);
}

export function ZapStrategyCard({ strategy, onStart }: ZapStrategyCardProps) {
  const metrics = keyBacktestMetrics(strategy);

  return (
    <Card
      className="p-5"
      style={{
        background:
          'linear-gradient(158deg,rgba(212,197,163,.12),rgba(20,20,22,.55))',
        border: '1px solid rgba(212,197,163,.24)',
      }}
    >
      <div
        aria-hidden="true"
        className="absolute"
        style={{
          bottom: -60,
          left: -40,
          width: 220,
          height: 220,
          background:
            'radial-gradient(circle,rgba(212,197,163,.16),transparent 70%)',
        }}
      />
      <div className="relative">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-[11px]">
            <span
              className="grid h-10 w-10 place-items-center rounded-xl"
              style={{
                background: '#0e0e10',
                border: '1px solid rgba(212,197,163,.35)',
              }}
            >
              <ZapLogo size={20} />
            </span>
            <div>
              <div className="font-serif text-[23px] leading-none text-ink">
                Zap Strategy
              </div>
              <div
                className="mt-[5px] font-mono text-[9.5px] uppercase tracking-[.1em]"
                style={{ color: '#9a8f78' }}
              >
                Disciplined autopilot
              </div>
            </div>
          </div>
          <Pill
            className="gap-[5px] px-[9px] py-1 font-mono text-[9.5px] text-ink-dim"
            style={{
              background: 'rgba(255,255,255,.05)',
              border: '1px solid rgba(255,255,255,.08)',
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: 999,
                background: '#7ad88f',
                animation: 'zpPulse 2.4s infinite',
              }}
            />
            AUTO
          </Pill>
        </div>

        <div
          className="mt-[15px] font-serif text-[17px] italic"
          style={{ color: '#d4cdbc' }}
        >
          &ldquo;{strategy.quote}&rdquo;
        </div>

        <div className="mt-[15px] flex items-end gap-4">
          <div className="shrink-0">
            <div className="font-serif text-[30px] leading-none text-accent">
              {strategy.estApyLabel}
            </div>
            <div
              className="mt-[5px] font-mono text-[9px] uppercase tracking-[.08em]"
              style={{ color: '#6f6a5f' }}
            >
              {strategy.estApyLabel === '—'
                ? 'Backtest ROI unavailable'
                : 'Default backtest ROI'}
            </div>
          </div>
          <div className="flex-1">
            <AllocationBar
              segments={strategy.pillars.map((pillar) => ({
                color: pillar.color,
                value: pillar.weight,
              }))}
            />
            <div
              className="mt-1.5 flex justify-between font-mono text-[8.5px] tracking-[.02em]"
              style={{ color: '#6f6a5f' }}
            >
              {strategy.pillars.map((pillar) => (
                <span key={pillar.label}>{pillar.label}</span>
              ))}
            </div>
          </div>
        </div>

        {metrics.length > 0 ? (
          <MetricsGrid className="mt-[15px]" metrics={metrics} />
        ) : null}

        <div className="mt-[15px] flex flex-wrap gap-1.5">
          {[
            'Managed automatically',
            'Non-custodial',
            'Base deposits in v1',
          ].map((tag) => (
            <Pill
              key={tag}
              className="gap-[5px] px-2.5 py-1.5 text-[11.5px]"
              style={{
                color: '#cfc7b6',
                background: 'rgba(255,255,255,.04)',
                border: '1px solid rgba(255,255,255,.08)',
              }}
            >
              <CheckGlyph />
              {tag}
            </Pill>
          ))}
        </div>

        <PrimaryButton className="mt-[17px]" onClick={onStart}>
          Start with Zap Strategy
          <ArrowGlyph />
        </PrimaryButton>
        <div
          className="mt-2.5 text-center font-mono text-[9.5px] tracking-[.04em]"
          style={{ color: '#6f6a5f' }}
        >
          {strategy.marketModeLabel}
        </div>
      </div>
    </Card>
  );
}
