import { AllocationBar } from '@/components/charts/AllocationBar';
import type { Metric } from '@/components/metrics/MetricsGrid';
import { ArrowGlyph } from '@/components/ui/ArrowGlyph';
import { Card } from '@/components/ui/Card';
import { Pill } from '@/components/ui/Pill';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { ZapLogo } from '@/components/ui/ZapLogo';

export interface ZapStrategyCardData {
  estApyLabel: string;
  quote: string;
  marketModeLabel: string;
  pillars: { label: string; weight: number; color: string }[];
  backtest: {
    metrics: Metric[];
  };
}

interface ZapStrategyCardProps {
  strategy: ZapStrategyCardData;
  onStart: () => void;
}

export function ZapStrategyCard({ strategy, onStart }: ZapStrategyCardProps) {
  const quote = strategy.quote.trim();
  const hasQuote = quote.length > 0 && quote !== '—';

  return (
    <Card
      className="p-4"
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

        {hasQuote ? (
          <div
            className="mt-[13px] font-serif text-[16px] italic"
            style={{ color: '#d4cdbc' }}
          >
            &ldquo;{quote}&rdquo;
          </div>
        ) : null}

        <div className="mt-[14px] flex items-end gap-4">
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

        <PrimaryButton className="mt-[16px]" onClick={onStart}>
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
