import { SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';

import { AllocationBar } from '@/components/charts/AllocationBar';
import { Sparkline } from '@/components/charts/Sparkline';
import { MetricsGrid } from '@/components/metrics/MetricsGrid';
import { RangeTabs } from '@/components/ui/RangeTabs';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { useAccount } from '@/integration/useAccount';
import { usePortfolioData } from '@/integration/usePortfolioData';
import { formatSignedPct, formatSignedUsd, splitUsd } from '@/lib/format';

const RANGE_OPTIONS = ['1W', '1M', '3M', '1Y', 'ALL'] as const;

/** My Portfolio — position value, returns chart, metrics, allocation. */
export function PortfolioScreen() {
  const [range, setRange] = useState<string>('1Y');
  const { userId } = useAccount();
  const { data: portfolio, isLoading } = usePortfolioData(userId);

  // Calm loading state: render the layout with neutral placeholders while
  // userId resolves or the dashboard query is in flight — never crash, never
  // break the phone frame. isError degrades the same way (portfolio is null).
  const loading = isLoading || portfolio === null;
  const hasPositionValue = typeof portfolio?.positionValue === 'number';
  const { whole, fraction } = splitUsd(portfolio?.positionValue ?? 0);
  const hasAllTimeChange = typeof portfolio?.changePct === 'number';
  const hasTodayChange = typeof portfolio?.changePctToday === 'number';

  return (
    <div data-screen="portfolio">
      <ScreenHeader
        title="My Portfolio"
        right={
          <button
            type="button"
            aria-label="Filter portfolio"
            className="zp-tap grid h-[34px] w-[34px] place-items-center rounded-full border border-line"
            style={{ background: 'rgba(255,255,255,.05)' }}
          >
            <SlidersHorizontal
              size={16}
              className="text-ink-dim"
              aria-hidden="true"
            />
          </button>
        }
      />

      <div className="px-5 pt-4">
        <SectionLabel className="text-[10px] tracking-[.14em]">
          Strategy position value
        </SectionLabel>
        <div className="mt-[5px] font-serif text-[50px] leading-[1.02] text-ink">
          {loading ? (
            <span style={{ color: '#6f6a5f' }}>—</span>
          ) : hasPositionValue ? (
            <>
              {whole}
              <span style={{ color: '#6f6a5f', fontSize: 32 }}>{fraction}</span>
            </>
          ) : (
            <span style={{ color: '#6f6a5f' }}>—</span>
          )}
        </div>
        <div className="mt-[9px] flex items-center gap-2">
          <span
            className="inline-flex items-center gap-1 rounded-full px-[9px] py-[3px] text-[12.5px] font-semibold text-success"
            style={{ background: 'rgba(122,216,143,.12)' }}
          >
            <span aria-hidden="true">▲</span>
            {loading || !hasAllTimeChange
              ? '—'
              : formatSignedPct(portfolio?.changePct ?? 0).replace('+', '')}
          </span>
          <span className="text-[13px] text-ink-dim">
            {loading || !hasAllTimeChange || !hasTodayChange
              ? 'all time · today'
              : `${formatSignedUsd(portfolio?.changeUsdAllTime ?? 0)} all time · ${formatSignedPct(portfolio?.changePctToday ?? 0)} today`}
          </span>
        </div>
      </div>

      <RangeTabs
        className="px-5 pt-[14px]"
        options={RANGE_OPTIONS}
        value={range}
        onChange={setRange}
      />

      <div className="mt-3 px-5">
        <div
          className="grid h-[170px] place-items-center"
          role="img"
          aria-label="Portfolio value over the selected range"
        >
          {portfolio?.chartData && portfolio.chartData.length >= 2 ? (
            <Sparkline
              data={portfolio.chartData}
              height={158}
              gradientId="portfolioValueSpark"
            />
          ) : (
            <span className="font-mono text-[18px] text-ink-faint">—</span>
          )}
        </div>
        <div className="mt-1 flex flex-wrap gap-3">
          <span className="inline-flex items-center gap-[5px] font-mono text-[9px] text-[#cfcabb]">
            <span
              className="h-[3px] w-[13px] rounded-[2px]"
              style={{ background: '#d4c5a3' }}
              aria-hidden="true"
            />
            Value
          </span>
        </div>
      </div>

      <MetricsGrid className="mt-5 px-5" metrics={portfolio?.metrics ?? []} />

      <div className="mt-6 px-5">
        <div className="flex items-center justify-between">
          <span className="text-[15px] font-semibold text-ink">
            Current allocation
          </span>
          <span className="font-mono text-[9.5px] text-ink-faint">
            High-level · managed for you
          </span>
        </div>
        <AllocationBar
          className="mt-[13px]"
          height={11}
          segments={(portfolio?.allocation ?? []).map((a) => ({
            color: a.color,
            value: a.pct,
          }))}
        />
        <div className="mt-[13px] flex flex-col gap-[9px]">
          {(portfolio?.allocation ?? []).map((item) => (
            <div key={item.label} className="flex items-center justify-between">
              <span className="inline-flex items-center gap-2 text-[13px] text-ink-dim">
                <span
                  className="h-[9px] w-[9px] rounded-full"
                  style={{ background: item.color }}
                  aria-hidden="true"
                />
                {item.label}
              </span>
              <span className="font-mono text-[12.5px] text-ink">
                {item.pct}%
              </span>
            </div>
          ))}
        </div>
        <div
          className="mt-[14px] flex items-center gap-2 rounded-[13px] px-[13px] py-[11px]"
          style={{
            background: 'rgba(212,197,163,.07)',
            border: '1px solid rgba(212,197,163,.2)',
          }}
        >
          <span
            className="h-[6px] w-[6px] rounded-full"
            style={{
              background: '#7ad88f',
              animation: 'zpPulse 2.4s infinite',
            }}
            aria-hidden="true"
          />
          <span className="text-[11.5px] text-ink-dim">
            {portfolio?.lastRebalancedLabel ?? 'Auto-managed by Zap Strategy'}
          </span>
        </div>
      </div>
    </div>
  );
}
