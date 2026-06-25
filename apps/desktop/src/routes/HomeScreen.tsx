import { ArrowDown, ArrowUp, MoreHorizontal } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { AllocationBar } from '@/components/charts/AllocationBar';
import { Sparkline } from '@/components/charts/Sparkline';
import { ChainIconStack } from '@/components/token/ChainIconStack';
import { TokenIcon } from '@/components/token/TokenIcon';
import { AppHeader } from '@/components/ui/AppHeader';
import { Card } from '@/components/ui/Card';
import { Pill } from '@/components/ui/Pill';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { RangeTabs } from '@/components/ui/RangeTabs';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { ZapLogo } from '@/components/ui/ZapLogo';
import { CHAINS, MOCK } from '@/data/mock';
import {
  formatSignedPct,
  formatSignedUsd,
  formatUsd,
  splitUsd,
} from '@/lib/format';

const RANGE_OPTIONS = ['1D', '1W', '1M', '1Y', 'ALL'] as const;

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

/** Home — total balance, assets (grouped by token), Zap Strategy card. */
export function HomeScreen() {
  const navigate = useNavigate();
  const [range, setRange] = useState<string>('1D');

  const { home, strategy } = MOCK;
  const { whole, fraction } = splitUsd(home.totalBalance);

  return (
    <div className="pb-6" data-screen="home">
      <AppHeader />

      {/* Balance card */}
      <div className="mt-4 px-5">
        <Card
          className="px-[22px] pb-[18px] pt-[22px]"
          style={{
            background:
              'linear-gradient(180deg,rgba(212,197,163,.08),rgba(255,255,255,.018))',
          }}
        >
          <div
            aria-hidden="true"
            className="absolute"
            style={{
              top: -70,
              right: -50,
              width: 210,
              height: 210,
              background:
                'radial-gradient(circle,rgba(212,197,163,.2),transparent 70%)',
            }}
          />
          <div className="relative">
            <SectionLabel className="tracking-[.16em] text-[11px] text-ink-dim">
              Total balance
            </SectionLabel>
            <div
              className="mt-1.5 font-serif leading-[1.02] tracking-[-.01em] text-ink"
              style={{ fontSize: 54 }}
            >
              {whole}
              <span style={{ color: '#6f6a5f', fontSize: 34 }}>{fraction}</span>
            </div>
            <div className="mt-2.5 flex items-center gap-2">
              <span
                className="inline-flex items-center gap-1 rounded-full px-[9px] py-[3px] text-[12.5px] font-semibold text-success"
                style={{ background: 'rgba(122,216,143,.12)' }}
              >
                ▲ {formatSignedPct(home.changePct)}
              </span>
              <span className="text-[13px] text-ink-dim">
                {formatSignedUsd(home.changeUsdToday)} today
              </span>
            </div>
            <div className="mt-3">
              <Sparkline data={home.sparkline} gradientId="sparkHome" />
            </div>
            <RangeTabs
              className="mt-2"
              options={RANGE_OPTIONS}
              value={range}
              onChange={setRange}
            />
          </div>
        </Card>
      </div>

      {/* Actions */}
      <div className="mt-3.5 flex gap-[11px] px-5">
        <PrimaryButton
          className="flex-1"
          onClick={() => navigate('/invest/amount')}
        >
          <ArrowDown size={17} strokeWidth={2.2} aria-hidden="true" />
          Deposit
        </PrimaryButton>
        <PrimaryButton variant="secondary" className="flex-1">
          <ArrowUp size={17} strokeWidth={2.2} aria-hidden="true" />
          Send
        </PrimaryButton>
        <button
          type="button"
          aria-label="More actions"
          className="zp-tap grid w-[52px] place-items-center rounded-[15px] border border-line text-ink-dim"
          style={{ background: 'rgba(255,255,255,.05)' }}
        >
          <MoreHorizontal size={20} aria-hidden="true" />
        </button>
      </div>

      {/* Assets */}
      <div className="mt-6 px-5">
        <div className="flex items-center justify-between">
          <div className="text-[17px] font-semibold text-ink">Assets</div>
          <div className="flex items-center gap-1.5">
            <ChainIconStack
              chains={['ethereum', 'base', 'arbitrum']}
              size={13}
            />
            <span className="font-mono text-[10px] tracking-[.02em] text-ink-faint">
              Unified across chains
            </span>
          </div>
        </div>
        <div className="mt-2.5 flex flex-col">
          {home.assets.map((asset, index) => {
            const isLast = index === home.assets.length - 1;
            return (
              <div
                key={asset.symbol}
                className="zp-tap flex items-center gap-[13px] px-1 py-[11px]"
                style={
                  isLast
                    ? undefined
                    : { borderBottom: '1px solid rgba(255,255,255,.05)' }
                }
              >
                <TokenIcon glyph={asset.glyph} bg={asset.iconBg} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-[7px]">
                    <span className="text-[15.5px] font-semibold text-ink">
                      {asset.symbol}
                    </span>
                    <span className="text-[12px]" style={{ color: '#6f6a5f' }}>
                      {asset.name}
                    </span>
                  </div>
                  <div className="mt-[5px] flex items-center gap-1.5">
                    <ChainIconStack chains={asset.chains} size={14} />
                    <span className="font-mono text-[10.5px] text-ink-faint">
                      {asset.chains.map((c) => CHAINS[c].label).join(' · ')}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[15.5px] font-semibold tabular-nums text-ink">
                    {formatUsd(asset.usdValue)}
                  </div>
                  <div className="mt-[5px] font-mono text-[10.5px] text-ink-faint">
                    {asset.amountLabel}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Strategy card */}
      <div className="mt-[22px] px-5">
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
                  Est. APY · variable
                </div>
              </div>
              <div className="flex-1">
                <AllocationBar
                  segments={strategy.pillars.map((p) => ({
                    color: p.color,
                    value: p.weight,
                  }))}
                />
                <div
                  className="mt-1.5 flex justify-between font-mono text-[8.5px] tracking-[.02em]"
                  style={{ color: '#6f6a5f' }}
                >
                  {strategy.pillars.map((p) => (
                    <span key={p.label}>{p.label}</span>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-[15px] flex flex-wrap gap-1.5">
              {[
                'Managed automatically',
                'Non-custodial',
                'Routes from any network',
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

            <PrimaryButton
              className="mt-[17px]"
              onClick={() => navigate('/invest/amount')}
            >
              Start with Zap Strategy
              <svg
                width="17"
                height="17"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#0a0a0a"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M5 12h14" />
                <path d="M13 6l6 6-6 6" />
              </svg>
            </PrimaryButton>
            <div
              className="mt-2.5 text-center font-mono text-[9.5px] tracking-[.04em]"
              style={{ color: '#6f6a5f' }}
            >
              {strategy.marketModeLabel}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
