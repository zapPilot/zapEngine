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
import { CHAINS } from '@/data/demo';
import { BASE_DEPOSIT_TOKENS } from '@/integration/depositTokens';
import { useAccount } from '@/integration/useAccount';
import { useInvest } from '@/integration/useInvest';
import { useInvestableBalances } from '@/integration/useInvestableBalances';
import { formatUsd } from '@/lib/format';

export type AmountUnit = 'USD' | 'Token';

/** Parse the grouped display amount (e.g. "1,000.50") to a number. */
function parseAmount(grouped: string): number {
  const parsed = Number(grouped.replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function joinWithAnd(items: string[]): string {
  if (items.length <= 1) {
    return items[0] ?? '';
  }
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

export function depositSupportLabel(
  tokens: readonly { symbol: string }[] = BASE_DEPOSIT_TOKENS,
): string {
  const supported = joinWithAnd(tokens.map((token) => `Base ${token.symbol}`));
  return `Deposit v1 supports ${supported}`;
}

export function amountUsdFromInput(
  groupedAmount: string,
  unit: AmountUnit,
  usdPrice: number | null,
): number | null {
  const value = parseAmount(groupedAmount);
  if (value <= 0) {
    return null;
  }
  if (unit === 'USD') {
    return value;
  }
  if (typeof usdPrice === 'number' && usdPrice > 0) {
    return value * usdPrice;
  }
  return null;
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
  const { address, walletAddresses } = useAccount();
  const balances = useInvestableBalances(
    walletAddresses.length > 0 ? walletAddresses : address,
  );
  const [amount, setAmount] = useState('1,000');
  const [unit, setUnit] = useState<AmountUnit>('USD');
  const selectedRow =
    balances.rows.find(
      (row) => row.depositToken?.symbol === selectedToken.symbol,
    ) ?? null;
  const amountUsd = amountUsdFromInput(
    amount,
    unit,
    selectedRow?.usdPrice ?? null,
  );
  const canReview = amountUsd !== null && selectedRow !== null;

  const handleReview = () => {
    if (!selectedRow || amountUsd === null) {
      return;
    }
    setAmountUsd(amountUsd);
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
          {unit === 'USD' ? '$' : null}
          {amount}
          {unit === 'Token' ? (
            <span className="ml-2 text-[30px] text-ink-dim">
              {selectedToken.symbol}
            </span>
          ) : null}
          <span
            className="text-accent"
            style={{ fontWeight: 300, animation: 'zpPulse 1.1s infinite' }}
          >
            |
          </span>
        </div>
        <div className="mt-3 font-mono text-[11.5px] text-ink-dim">
          Ethereum · Base · Arbitrum holdings · {selectedToken.symbol}
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
              Available across Ethereum · Base · Arbitrum
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
              {depositSupportLabel()}
            </span>
          </div>
          <div className="mt-[13px] flex flex-col gap-[11px]">
            {!balances.isConnected ? (
              <div className="px-1 py-[11px] text-[12px] text-ink-faint">
                Connect wallet to load supported holdings.
              </div>
            ) : balances.isLoading ? (
              <div className="px-1 py-[11px] text-[12px] text-ink-faint">
                Loading wallet tokens...
              </div>
            ) : balances.isError ? (
              <div className="px-1 py-[11px] text-[12px] text-ink-faint">
                Wallet tokens unavailable.
              </div>
            ) : balances.rows.length === 0 ? (
              <div className="px-1 py-[11px] text-[12px] text-ink-faint">
                No supported token holdings yet.
              </div>
            ) : (
              balances.rows.map((row) => {
                const active =
                  row.depositToken?.symbol === selectedToken.symbol;
                const disabled = !row.isDepositSupported || !row.depositToken;
                return (
                  <button
                    key={row.token.symbol}
                    type="button"
                    onClick={() => {
                      if (!row.depositToken) {
                        return;
                      }
                      setSelectedToken(row.depositToken);
                      setSelectedTokenUsdPrice(row.usdPrice);
                    }}
                    disabled={disabled}
                    aria-disabled={disabled}
                    className="zp-tap flex items-center gap-2.5 rounded-xl px-1 py-1 text-left"
                    style={
                      active
                        ? { background: 'rgba(212,197,163,.09)' }
                        : disabled
                          ? { opacity: 0.55 }
                          : undefined
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
                      <div className="mt-[2px] font-mono text-[9px] text-ink-faint">
                        {row.chains
                          .map((chain) => CHAINS[chain].label)
                          .join(' · ')}
                        {disabled ? ' · view only' : ''}
                      </div>
                    </div>
                    <span className="mr-2">
                      <ChainIconStack chains={row.chains} size={13} />
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
              })
            )}
          </div>
        </div>
      </Card>

      <NumericKeypad onKey={handleKey} />

      <div className="px-5 pt-1.5">
        <PrimaryButton onClick={handleReview} disabled={!canReview}>
          Review route
          <ArrowGlyph />
        </PrimaryButton>
        <div className="mt-[9px] text-center text-[11px] text-ink-faint">
          Holdings read Ethereum · Base · Arbitrum. Routing v1 uses Base{' '}
          {BASE_DEPOSIT_TOKENS.map((token) => token.symbol).join('/')}.
        </div>
      </div>

      <div className="h-[14px]" aria-hidden="true" />
    </div>
  );
}
