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
import { SkeletonBlock } from '@/components/ui/Skeleton';
import { CHAINS } from '@/data/demo';
import {
  DEPOSIT_PATHS,
  depositPathChainLabel,
  depositPathInputLabel,
  depositPathProtocolLabel,
  type DesktopDepositPath,
  isGmxDepositPath,
} from '@/integration/depositPaths';
import {
  BASE_DEPOSIT_TOKENS,
  type DesktopDepositToken,
} from '@/integration/depositTokens';
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

type InvestableBalancesState = ReturnType<typeof useInvestableBalances>;

function HoldingRowSkeleton() {
  return (
    <div className="flex items-center gap-2.5 rounded-xl px-1 py-1">
      <SkeletonBlock className="h-[26px] w-[26px] rounded-full" />
      <div className="flex-1">
        <SkeletonBlock className="h-4 w-12" />
        <SkeletonBlock className="mt-[6px] h-3 w-24" />
      </div>
      <SkeletonBlock className="mr-2 h-4 w-12 rounded-full" />
      <SkeletonBlock className="h-4 w-16" />
    </div>
  );
}

function HoldingListSkeleton() {
  return (
    <div aria-label="Loading supported holdings" role="status">
      {[0, 1, 2].map((item) => (
        <HoldingRowSkeleton key={item} />
      ))}
      <span className="sr-only">Loading supported holdings…</span>
    </div>
  );
}

function HoldingMessage({ children }: { children: string }) {
  return (
    <div className="px-1 py-[11px] text-[12px] text-ink-faint">{children}</div>
  );
}

function HoldingRowButton({
  row,
  active,
  disabled,
  onSelect,
}: {
  row: InvestableBalancesState['rows'][number];
  active: boolean;
  disabled: boolean;
  onSelect: (token: DesktopDepositToken, usdPrice: number | null) => void;
}) {
  return (
    <button
      key={row.token.symbol}
      type="button"
      onClick={() => {
        if (!row.depositToken) {
          return;
        }
        onSelect(row.depositToken, row.usdPrice);
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
      <TokenIcon glyph={row.token.glyph} bg={row.token.iconBg} size={26} />
      <div className="flex-1">
        <span className="text-[13.5px] font-semibold">{row.token.symbol}</span>
        <div className="mt-[2px] font-mono text-[9px] text-ink-faint">
          {row.chains.map((chain) => CHAINS[chain].label).join(' · ')}
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
        {typeof row.usdValue === 'number' ? formatUsd(row.usdValue) : '—'}
      </span>
    </button>
  );
}

function HoldingRows({
  balances,
  isGmxPath,
  selectedTokenSymbol,
  onSelect,
}: {
  balances: InvestableBalancesState;
  isGmxPath: boolean;
  selectedTokenSymbol: string;
  onSelect: (token: DesktopDepositToken, usdPrice: number | null) => void;
}) {
  if (!balances.isConnected) {
    return (
      <HoldingMessage>
        Connect wallet to load supported holdings.
      </HoldingMessage>
    );
  }
  if (balances.isLoading) {
    return <HoldingListSkeleton />;
  }
  if (balances.isError) {
    return <HoldingMessage>Wallet tokens unavailable.</HoldingMessage>;
  }
  if (balances.rows.length === 0) {
    return <HoldingMessage>No supported token holdings yet.</HoldingMessage>;
  }

  return (
    <>
      {balances.rows.map((row) => {
        const active =
          !isGmxPath && row.depositToken?.symbol === selectedTokenSymbol;
        const disabled =
          isGmxPath || !row.isDepositSupported || !row.depositToken;
        return (
          <HoldingRowButton
            key={row.token.symbol}
            row={row}
            active={active}
            disabled={disabled}
            onSelect={onSelect}
          />
        );
      })}
    </>
  );
}

function HoldingsCard({
  balances,
  isGmxPath,
  selectedTokenSymbol,
  onSelectToken,
}: {
  balances: InvestableBalancesState;
  isGmxPath: boolean;
  selectedTokenSymbol: string;
  onSelectToken: (token: DesktopDepositToken, usdPrice: number | null) => void;
}) {
  const showBalancesSkeleton = balances.isConnected && balances.isLoading;

  return (
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
            {showBalancesSkeleton ? (
              <SkeletonBlock className="h-4 w-16" />
            ) : typeof balances.totalUsdValue === 'number' ? (
              formatUsd(balances.totalUsdValue)
            ) : (
              '—'
            )}
          </span>
        </div>
        <div className="mt-2 flex items-center gap-1.5">
          <Check size={12} strokeWidth={3} className="text-success" />
          <span className="font-mono text-[10px] tracking-[.02em] text-success">
            {depositSupportLabel()}
            {isGmxPath ? ' · GMX uses Arbitrum USDC' : ''}
          </span>
        </div>
        <div className="mt-[13px] flex flex-col gap-[11px]">
          <HoldingRows
            balances={balances}
            isGmxPath={isGmxPath}
            selectedTokenSymbol={selectedTokenSymbol}
            onSelect={onSelectToken}
          />
        </div>
      </div>
    </Card>
  );
}

function DepositPathSelector({
  selectedDepositPath,
  onSelect,
}: {
  selectedDepositPath: DesktopDepositPath;
  onSelect: (path: DesktopDepositPath) => void;
}) {
  return (
    <Card className="mx-5 mt-[18px] rounded-[18px]" style={cardStyle}>
      <div className="px-4 py-[15px]">
        <div className="flex items-center justify-between">
          <span className="text-[12.5px] text-ink-dim">Deposit path</span>
          <span className="font-mono text-[9.5px] uppercase tracking-[.08em] text-accent">
            Test selector
          </span>
        </div>
        <div className="mt-3 grid gap-2">
          {DEPOSIT_PATHS.map((path) => {
            const active = path.id === selectedDepositPath.id;
            return (
              <button
                key={path.id}
                type="button"
                onClick={() => onSelect(path)}
                className="zp-tap rounded-[14px] px-3 py-2.5 text-left"
                style={
                  active
                    ? {
                        background: 'rgba(212,197,163,.12)',
                        border: '1px solid rgba(212,197,163,.32)',
                      }
                    : {
                        background: 'rgba(255,255,255,.025)',
                        border: '1px solid rgba(255,255,255,.07)',
                      }
                }
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[13px] font-semibold text-ink">
                    {depositPathProtocolLabel(path)}
                  </span>
                  <span className="rounded-full px-2 py-1 font-mono text-[9px] uppercase tracking-[.08em] text-ink-dim">
                    {depositPathChainLabel(path)}
                  </span>
                </div>
                <div className="mt-1 text-[10.5px] text-ink-faint">
                  Input: {depositPathInputLabel(path)}
                  {isGmxDepositPath(path)
                    ? ' · GMX keeper settlement path'
                    : ' · current Morpho deposit route'}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

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

function nextGroupedAmount(current: string, key: string): string {
  const raw = current.replace(/,/g, '');
  if (key === 'back') {
    return groupAmount(raw.slice(0, -1));
  }
  if (key === '.') {
    return raw.includes('.') ? current : groupAmount(`${raw}.`);
  }
  const next = raw === '0' ? key : `${raw}${key}`;
  return groupAmount(next);
}

/** Invest step 1/3 — amount input, USD/Token toggle, source tokens, keypad. */
export function InvestAmountScreen() {
  const navigate = useNavigate();
  const {
    selectedToken,
    selectedDepositPath,
    setAmountUsd,
    setSelectedDepositPath,
    setSelectedToken,
    setSelectedTokenUsdPrice,
  } = useInvest();
  const { address, walletAddresses } = useAccount();
  const balances = useInvestableBalances(
    walletAddresses.length > 0 ? walletAddresses : address,
  );
  const [amount, setAmount] = useState('1,000');
  const [unit, setUnit] = useState<AmountUnit>('USD');
  const isGmxPath = isGmxDepositPath(selectedDepositPath);
  const selectedRow =
    balances.rows.find((row) =>
      isGmxPath
        ? row.token.symbol === 'USDC' && row.chains.includes('arbitrum')
        : row.depositToken?.symbol === selectedToken.symbol,
    ) ?? null;
  const amountUsd = amountUsdFromInput(
    amount,
    unit,
    isGmxPath ? 1 : (selectedRow?.usdPrice ?? null),
  );
  const hasSelectedSource = isGmxPath || selectedRow !== null;
  const canReview = amountUsd !== null && hasSelectedSource;
  const inputSymbol = isGmxPath ? 'USDC' : selectedToken.symbol;

  const handleReview = () => {
    const reviewAmountUsd = amountUsd;
    if (reviewAmountUsd === null || !hasSelectedSource) {
      return;
    }
    setAmountUsd(reviewAmountUsd);
    setSelectedTokenUsdPrice(isGmxPath ? 1 : (selectedRow?.usdPrice ?? null));
    void navigate('/invest/route');
  };

  const handleKey = (key: string) => {
    setAmount((current) => nextGroupedAmount(current, key));
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
            <span className="ml-2 text-[30px] text-ink-dim">{inputSymbol}</span>
          ) : null}
          <span
            className="text-accent"
            style={{ fontWeight: 300, animation: 'zpPulse 1.1s infinite' }}
          >
            |
          </span>
        </div>
        <div className="mt-3 font-mono text-[11.5px] text-ink-dim">
          {depositPathChainLabel(selectedDepositPath)} ·{' '}
          {depositPathInputLabel(selectedDepositPath)} · {inputSymbol}
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

      <DepositPathSelector
        selectedDepositPath={selectedDepositPath}
        onSelect={setSelectedDepositPath}
      />

      <HoldingsCard
        balances={balances}
        isGmxPath={isGmxPath}
        selectedTokenSymbol={selectedToken.symbol}
        onSelectToken={(token, usdPrice) => {
          setSelectedToken(token);
          setSelectedTokenUsdPrice(usdPrice);
        }}
      />

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
