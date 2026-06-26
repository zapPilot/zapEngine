import { Check } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { NumericKeypad } from '@/components/invest/NumericKeypad';
import { StepHeader } from '@/components/invest/StepHeader';
import { StepProgress } from '@/components/invest/StepProgress';
import { ChainIconStack } from '@/components/token/ChainIconStack';
import { TokenIcon } from '@/components/token/TokenIcon';
import { ArrowGlyph } from '@/components/ui/ArrowGlyph';
import { Card } from '@/components/ui/Card';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { MOCK } from '@/data/mock';
import { useInvest } from '@/integration/useInvest';
import { formatUsd } from '@/lib/format';

/** Parse the grouped display amount (e.g. "1,000.50") to a number. */
function parseAmount(grouped: string): number {
  const parsed = Number(grouped.replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

const cardStyle = {
  background: 'rgba(255,255,255,.025)',
  border: '1px solid rgba(255,255,255,.08)',
} as const;

/** Re-applies en-US thousands grouping while preserving a trailing `.` / decimals. */
function groupAmount(raw: string): string {
  if (raw === '') {
    return '0';
  }
  const [whole = '', fraction] = raw.split('.');
  const groupedWhole = (Number(whole) || 0).toLocaleString('en-US');
  if (fraction === undefined) {
    return raw.includes('.') ? `${groupedWhole}.` : groupedWhole;
  }
  return `${groupedWhole}.${fraction}`;
}

/** Invest step 1/3 — amount input, USD/Token toggle, source tokens, keypad. */
export function InvestAmountScreen() {
  const navigate = useNavigate();
  const { setAmountUsd } = useInvest();
  const [amount, setAmount] = useState('1,000');
  const [unit, setUnit] = useState<'USD' | 'Token'>('USD');

  const handleReview = () => {
    setAmountUsd(parseAmount(amount));
    void navigate('/invest/route');
  };

  const handleKey = (key: string) => {
    setAmount((current) => {
      // Work on a raw (ungrouped) string so editing is digit-accurate.
      const raw = current.replace(/,/g, '');
      if (key === 'back') {
        return groupAmount(raw.slice(0, -1));
      }
      if (key === '.') {
        return raw.includes('.') ? current : groupAmount(`${raw}.`);
      }
      // Drop a leading placeholder zero when typing the first real digit.
      const next = raw === '0' ? key : `${raw}${key}`;
      return groupAmount(next);
    });
  };

  const sources = MOCK.home.assets.slice(0, 2);

  return (
    <div className="font-sans text-ink">
      <StepHeader title="Start investing" step="STEP 1 OF 3 · AMOUNT" />
      <StepProgress current={1} />

      <div className="px-5 pt-[30px] text-center">
        <div
          className="font-serif leading-none"
          style={{ fontSize: 66, letterSpacing: '-.01em' }}
        >
          ${amount}
          <span
            className="text-accent"
            style={{ fontWeight: 300, animation: 'zpPulse 1.1s infinite' }}
          >
            |
          </span>
        </div>
        <div className="mt-3 font-mono text-[11.5px] text-ink-dim">
          ≈ 0.276 ETH · sourced across 3 chains
        </div>
        <div
          className="mt-4 inline-flex rounded-full p-[3px]"
          style={{
            background: 'rgba(255,255,255,.05)',
            border: '1px solid rgba(255,255,255,.07)',
          }}
        >
          {(['USD', 'Token'] as const).map((option) => {
            const active = unit === option;
            return (
              <button
                key={option}
                type="button"
                onClick={() => setUnit(option)}
                className="zp-tap rounded-full px-[17px] py-1.5 text-[12.5px]"
                style={
                  active
                    ? {
                        background: 'var(--accent)',
                        color: '#0a0a0a',
                        fontWeight: 600,
                      }
                    : { color: '#a1a1aa', fontWeight: 500 }
                }
              >
                {option}
              </button>
            );
          })}
        </div>
      </div>

      <Card className="mx-5 mt-[22px] rounded-[18px]" style={cardStyle}>
        <div className="px-4 py-[15px]">
          <div className="flex items-center justify-between">
            <span className="text-[12.5px] text-ink-dim">
              Available across chains
            </span>
            <span
              className="text-[13.5px] font-semibold"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {/* NOTE(real-data): useAccount exposes no balance source yet;
                  show the design's portfolio total until a balances hook lands. */}
              {formatUsd(MOCK.home.totalBalance)}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-1.5">
            <Check size={12} strokeWidth={3} className="text-success" />
            <span className="font-mono text-[10px] tracking-[.02em] text-success">
              Auto-selected for the cheapest route
            </span>
          </div>
          <div className="mt-[13px] flex flex-col gap-[11px]">
            {sources.map((asset) => (
              <div key={asset.symbol} className="flex items-center gap-2.5">
                <TokenIcon glyph={asset.glyph} bg={asset.iconBg} size={26} />
                <div className="flex-1">
                  <span className="text-[13.5px] font-semibold">
                    {asset.symbol}
                  </span>
                </div>
                <span className="mr-2">
                  <ChainIconStack chains={asset.chains} size={13} />
                </span>
                <span
                  className="text-[13px] font-semibold text-ink-dim"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {formatUsd(asset.usdValue)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <NumericKeypad onKey={handleKey} />

      <div className="px-5 pt-1.5">
        <PrimaryButton onClick={handleReview}>
          Review route
          <ArrowGlyph />
        </PrimaryButton>
        <div className="mt-[9px] text-center text-[11px] text-ink-faint">
          No manual bridging or chain switching — Zap Pilot handles it.
        </div>
      </div>

      <div className="h-[14px]" aria-hidden="true" />
    </div>
  );
}
