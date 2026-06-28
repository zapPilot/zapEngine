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
import { useInvest } from '@/integration/useInvest';
import { useInvestableBalances } from '@/integration/useInvestableBalances';
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
  const {
    selectedToken,
    setAmountUsd,
    setSelectedToken,
    setSelectedTokenUsdPrice,
  } = useInvest();
  const balances = useInvestableBalances();
  const [amount, setAmount] = useState('1,000');
  const [unit, setUnit] = useState<'USD' | 'Token'>('USD');
  const selectedRow =
    balances.rows.find((row) => row.token.symbol === selectedToken.symbol) ??
    balances.rows[0];

  const handleReview = () => {
    setAmountUsd(parseAmount(amount));
    setSelectedTokenUsdPrice(selectedRow?.usdPrice ?? null);
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
          Base-only source · {selectedToken.symbol}
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
              Available on Base
            </span>
            <span
              className="text-[13.5px] font-semibold"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {typeof balances.totalUsdValue === 'number'
                ? formatUsd(balances.totalUsdValue)
                : '—'}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-1.5">
            <Check size={12} strokeWidth={3} className="text-success" />
            <span className="font-mono text-[10px] tracking-[.02em] text-success">
              Deposit v1 supports Base USDC and Base ETH
            </span>
          </div>
          <div className="mt-[13px] flex flex-col gap-[11px]">
            {balances.rows.map((row) => {
              const active = row.token.symbol === selectedToken.symbol;
              return (
                <button
                  key={row.token.symbol}
                  type="button"
                  onClick={() => {
                    setSelectedToken(row.token);
                    setSelectedTokenUsdPrice(row.usdPrice);
                  }}
                  className="zp-tap flex items-center gap-2.5 rounded-xl px-1 py-1 text-left"
                  style={
                    active ? { background: 'rgba(212,197,163,.09)' } : undefined
                  }
                >
                  <TokenIcon
                    glyph={row.token.glyph}
                    bg={row.token.iconBg}
                    size={26}
                  />
                  <div className="flex-1">
                    <span className="text-[13.5px] font-semibold">
                      {row.token.symbol}
                    </span>
                  </div>
                  <span className="mr-2">
                    <ChainIconStack chains={['base']} size={13} />
                  </span>
                  <span
                    className="text-[13px] font-semibold text-ink-dim"
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                  >
                    {typeof row.usdValue === 'number'
                      ? formatUsd(row.usdValue)
                      : '—'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </Card>

      <NumericKeypad onKey={handleKey} />

      <div className="px-5 pt-1.5">
        <PrimaryButton
          onClick={handleReview}
          disabled={parseAmount(amount) <= 0}
        >
          Review route
          <ArrowGlyph />
        </PrimaryButton>
        <div className="mt-[9px] text-center text-[11px] text-ink-faint">
          Base-only source in this version; Zap Pilot prepares the route.
        </div>
      </div>

      <div className="h-[14px]" aria-hidden="true" />
    </div>
  );
}
