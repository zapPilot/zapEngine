import { SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';

import { AllocationBar } from '@/components/charts/AllocationBar';
import { MetricsGrid } from '@/components/metrics/MetricsGrid';
import { RangeTabs } from '@/components/ui/RangeTabs';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { MOCK } from '@/data/mock';
import { formatSignedPct, formatSignedUsd, splitUsd } from '@/lib/format';

const RANGE_OPTIONS = ['1W', '1M', '3M', '1Y', 'ALL'] as const;

/** My Portfolio — position value, returns chart, metrics, allocation. */
export function PortfolioScreen() {
  const [range, setRange] = useState<string>('1Y');
  const { portfolio } = MOCK;
  const { whole, fraction } = splitUsd(portfolio.positionValue);

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
          {whole}
          <span style={{ color: '#6f6a5f', fontSize: 32 }}>{fraction}</span>
        </div>
        <div className="mt-[9px] flex items-center gap-2">
          <span
            className="inline-flex items-center gap-1 rounded-full px-[9px] py-[3px] text-[12.5px] font-semibold text-success"
            style={{ background: 'rgba(122,216,143,.12)' }}
          >
            <span aria-hidden="true">▲</span>
            {formatSignedPct(portfolio.changePct).replace('+', '')}
          </span>
          <span className="text-[13px] text-ink-dim">
            {formatSignedUsd(portfolio.changeUsdAllTime)} all time ·{' '}
            {formatSignedPct(portfolio.changePctToday)} today
          </span>
        </div>
      </div>

      <RangeTabs
        className="px-5 pt-[14px]"
        options={RANGE_OPTIONS}
        value={range}
        onChange={setRange}
      />

      {/* Returns chart. Deposit (triangle) / rebalance (circle) markers are a
          mock overlay pending a real portfolio-events API. */}
      <div className="mt-3 px-5">
        <svg
          width="100%"
          height="170"
          viewBox="0 0 340 170"
          className="block"
          role="img"
          aria-label="Portfolio value over the selected range against principal and benchmark"
        >
          <defs>
            <linearGradient id="pfArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="rgba(212,197,163,.26)" />
              <stop offset="1" stopColor="rgba(212,197,163,0)" />
            </linearGradient>
          </defs>
          <path
            d="M14,118 L46,113 L78,107 L110,109 L142,99 L174,86 L206,84 L238,80 L270,67 L302,57 L326,50 L326,140 L14,140 Z"
            fill="url(#pfArea)"
          />
          <path
            d="M14,126 L78,126 L78,114 L174,114 L174,100 L326,100"
            fill="none"
            stroke="#6f6a5f"
            strokeWidth="1.4"
            strokeDasharray="4 4"
            opacity=".8"
          />
          <path
            d="M14,121 L78,114 L142,106 L206,93 L270,78 L326,64"
            fill="none"
            stroke="rgba(212,197,163,.4)"
            strokeWidth="1.3"
            strokeDasharray="2 3"
          />
          <path
            d="M14,118 L46,113 L78,107 L110,109 L142,99 L174,86 L206,84 L238,80 L270,67 L302,57 L326,50"
            fill="none"
            stroke="#d4c5a3"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M14,112 L18,120 L10,120 Z"
            fill="#d4c5a3"
            stroke="#0a0a0a"
            strokeWidth="1"
          />
          <path
            d="M174,80 L178,88 L170,88 Z"
            fill="#d4c5a3"
            stroke="#0a0a0a"
            strokeWidth="1"
          />
          <circle
            cx="110"
            cy="109"
            r="3.4"
            fill="#2775ca"
            stroke="#0a0a0a"
            strokeWidth="1.4"
          />
          <circle
            cx="270"
            cy="67"
            r="3.4"
            fill="#2775ca"
            stroke="#0a0a0a"
            strokeWidth="1.4"
          />
          <path
            d="M238,75 L243,80 L238,85 L233,80 Z"
            fill="#d7dde7"
            stroke="#0a0a0a"
            strokeWidth="1.2"
          />
          <circle cx="326" cy="50" r="3.2" fill="#d4c5a3" />
          <text
            x="14"
            y="160"
            fontFamily="JetBrains Mono,monospace"
            fontSize="8"
            fill="#52525b"
          >
            Jan
          </text>
          <text
            x="108"
            y="160"
            fontFamily="JetBrains Mono,monospace"
            fontSize="8"
            fill="#52525b"
          >
            Mar
          </text>
          <text
            x="206"
            y="160"
            fontFamily="JetBrains Mono,monospace"
            fontSize="8"
            fill="#52525b"
          >
            May
          </text>
          <text
            x="308"
            y="160"
            fontFamily="JetBrains Mono,monospace"
            fontSize="8"
            fill="#52525b"
          >
            Jul
          </text>
        </svg>
        <div className="mt-1 flex flex-wrap gap-3">
          <span className="inline-flex items-center gap-[5px] font-mono text-[9px] text-[#cfcabb]">
            <span
              className="h-[3px] w-[13px] rounded-[2px]"
              style={{ background: '#d4c5a3' }}
              aria-hidden="true"
            />
            Value
          </span>
          <span className="inline-flex items-center gap-[5px] font-mono text-[9px] text-[#8a857a]">
            <span
              className="h-0 w-[13px]"
              style={{ borderTop: '1.5px dashed #6f6a5f' }}
              aria-hidden="true"
            />
            Principal
          </span>
          <span className="inline-flex items-center gap-[5px] font-mono text-[9px] text-[#8a857a]">
            <span
              className="h-0 w-[13px]"
              style={{ borderTop: '1.5px dashed rgba(212,197,163,.5)' }}
              aria-hidden="true"
            />
            Benchmark
          </span>
          <span className="inline-flex items-center gap-1 font-mono text-[9px] text-[#8a857a]">
            <span
              className="h-0 w-0"
              style={{
                borderLeft: '4px solid transparent',
                borderRight: '4px solid transparent',
                borderBottom: '7px solid #d4c5a3',
              }}
              aria-hidden="true"
            />
            Deposit
          </span>
          <span className="inline-flex items-center gap-1 font-mono text-[9px] text-[#8a857a]">
            <span
              className="h-[7px] w-[7px] rounded-full"
              style={{ background: '#2775ca' }}
              aria-hidden="true"
            />
            Rebalance
          </span>
        </div>
      </div>

      <MetricsGrid className="mt-5 px-5" metrics={portfolio.metrics} />

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
          segments={portfolio.allocation.map((a) => ({
            color: a.color,
            value: a.pct,
          }))}
        />
        <div className="mt-[13px] flex flex-col gap-[9px]">
          {portfolio.allocation.map((item) => (
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
            {portfolio.lastRebalancedLabel}
          </span>
        </div>
      </div>
    </div>
  );
}
