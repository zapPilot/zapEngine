import { SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';

import { AllocationBar } from '@/components/charts/AllocationBar';
import { Sparkline } from '@/components/charts/Sparkline';
import { MetricsGrid } from '@/components/metrics/MetricsGrid';
import { MetricsGridSkeleton } from '@/components/metrics/MetricsGridSkeleton';
import { RangeTabs } from '@/components/ui/RangeTabs';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import { useAccount } from '@/integration/useAccount';
import {
  type PortfolioRange,
  usePortfolioData,
} from '@/integration/usePortfolioData';
import { formatSignedPct, formatSignedUsd, splitUsd } from '@/lib/format';

const RANGE_OPTIONS = ['1W', '1M', '3M', '1Y', 'ALL'] as const;

function PortfolioAllocationSkeleton() {
  return (
    <div>
      <SkeletonBlock className="mt-[13px] h-[11px] w-full rounded-full" />
      <div className="mt-[13px] flex flex-col gap-[9px]">
        {[0, 1, 2].map((item) => (
          <div key={item} className="flex items-center justify-between">
            <span className="inline-flex items-center gap-2">
              <SkeletonBlock className="h-[9px] w-[9px] rounded-full" />
              <SkeletonBlock className="h-4 w-20" />
            </span>
            <SkeletonBlock className="h-4 w-9" />
          </div>
        ))}
      </div>
    </div>
  );
}

type PortfolioData = ReturnType<typeof usePortfolioData>['data'];

function PositionValue({
  fraction,
  hasPositionValue,
  loading,
  showPositionSkeleton,
  whole,
}: {
  fraction: string;
  hasPositionValue: boolean;
  loading: boolean;
  showPositionSkeleton: boolean;
  whole: string;
}) {
  if (showPositionSkeleton) {
    return <SkeletonBlock className="h-[51px] w-[190px] rounded-xl" />;
  }

  if (loading || !hasPositionValue) {
    return <span style={{ color: '#6f6a5f' }}>—</span>;
  }

  return (
    <>
      {whole}
      <span style={{ color: '#6f6a5f', fontSize: 32 }}>{fraction}</span>
    </>
  );
}

function PositionChangeLine({
  hasAllTimeChange,
  hasTodayChange,
  loading,
  portfolio,
  showPositionSkeleton,
}: {
  hasAllTimeChange: boolean;
  hasTodayChange: boolean;
  loading: boolean;
  portfolio: PortfolioData;
  showPositionSkeleton: boolean;
}) {
  if (showPositionSkeleton) {
    return (
      <>
        <SkeletonBlock className="h-[25px] w-[62px] rounded-full" />
        <SkeletonBlock className="h-4 w-40" />
      </>
    );
  }

  return (
    <>
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
    </>
  );
}

function PortfolioPositionSection({
  loading,
  portfolio,
  showPositionSkeleton,
}: {
  loading: boolean;
  portfolio: PortfolioData;
  showPositionSkeleton: boolean;
}) {
  const hasPositionValue = typeof portfolio?.positionValue === 'number';
  const { whole, fraction } = splitUsd(portfolio?.positionValue ?? 0);
  const hasAllTimeChange = typeof portfolio?.changePct === 'number';
  const hasTodayChange = typeof portfolio?.changePctToday === 'number';

  return (
    <div className="px-5 pt-4">
      <SectionLabel className="text-[10px] tracking-[.14em]">
        Strategy position value
      </SectionLabel>
      <div className="mt-[5px] font-serif text-[50px] leading-[1.02] text-ink">
        <PositionValue
          fraction={fraction}
          hasPositionValue={hasPositionValue}
          loading={loading}
          showPositionSkeleton={showPositionSkeleton}
          whole={whole}
        />
      </div>
      <div className="mt-[9px] flex items-center gap-2">
        <PositionChangeLine
          hasAllTimeChange={hasAllTimeChange}
          hasTodayChange={hasTodayChange}
          loading={loading}
          portfolio={portfolio}
          showPositionSkeleton={showPositionSkeleton}
        />
      </div>
    </div>
  );
}

function PortfolioChartSection({
  portfolio,
  showChartSkeleton,
}: {
  portfolio: PortfolioData;
  showChartSkeleton: boolean;
}) {
  return (
    <div className="mt-3 px-5">
      <div
        className="grid h-[170px] place-items-center"
        role="img"
        aria-label="Portfolio value over the selected range"
      >
        {showChartSkeleton ? (
          <SkeletonBlock className="h-[158px] w-full rounded-2xl" />
        ) : portfolio?.chartData && portfolio.chartData.length >= 2 ? (
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
  );
}

function PortfolioMetricsSection({
  portfolio,
  showMetricsSkeleton,
}: {
  portfolio: PortfolioData;
  showMetricsSkeleton: boolean;
}) {
  if (showMetricsSkeleton) {
    return <MetricsGridSkeleton className="mt-5 px-5" />;
  }

  return (
    <MetricsGrid className="mt-5 px-5" metrics={portfolio?.metrics ?? []} />
  );
}

function PortfolioAllocationContent({
  portfolio,
  showAllocationSkeleton,
}: {
  portfolio: PortfolioData;
  showAllocationSkeleton: boolean;
}) {
  if (showAllocationSkeleton) {
    return <PortfolioAllocationSkeleton />;
  }

  return (
    <>
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
    </>
  );
}

function PortfolioAllocationSection({
  portfolio,
  showAllocationSkeleton,
}: {
  portfolio: PortfolioData;
  showAllocationSkeleton: boolean;
}) {
  return (
    <div className="mt-6 px-5">
      <div className="flex items-center justify-between">
        <span className="text-[15px] font-semibold text-ink">
          Current allocation
        </span>
        <span className="font-mono text-[9.5px] text-ink-faint">
          High-level · managed for you
        </span>
      </div>
      <PortfolioAllocationContent
        portfolio={portfolio}
        showAllocationSkeleton={showAllocationSkeleton}
      />
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
  );
}

/** My Portfolio — position value, returns chart, metrics, allocation. */
export function PortfolioScreen() {
  const [range, setRange] = useState<PortfolioRange>('1Y');
  const { userId } = useAccount();
  const {
    data: portfolio,
    isLoading,
    isError,
  } = usePortfolioData(userId, range);

  // Calm loading state: render the layout with neutral placeholders while
  // userId resolves or the dashboard query is in flight — never crash, never
  // break the phone frame. isError degrades the same way (portfolio is null).
  const loading = isLoading || isError || portfolio === null;
  const hasPositionValue = typeof portfolio?.positionValue === 'number';
  const showPositionSkeleton = isLoading && !hasPositionValue;
  const showChartSkeleton = isLoading && !portfolio?.chartData.length;
  const showMetricsSkeleton = isLoading && !portfolio?.metrics.length;
  const showAllocationSkeleton = isLoading && !portfolio?.allocation.length;

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

      <PortfolioPositionSection
        loading={loading}
        portfolio={portfolio}
        showPositionSkeleton={showPositionSkeleton}
      />

      <RangeTabs
        className="px-5 pt-[14px]"
        options={RANGE_OPTIONS}
        value={range}
        onChange={(value) => setRange(value as PortfolioRange)}
      />

      <PortfolioChartSection
        portfolio={portfolio}
        showChartSkeleton={showChartSkeleton}
      />

      <PortfolioMetricsSection
        portfolio={portfolio}
        showMetricsSkeleton={showMetricsSkeleton}
      />

      <PortfolioAllocationSection
        portfolio={portfolio}
        showAllocationSkeleton={showAllocationSkeleton}
      />
    </div>
  );
}
