import { Check } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

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

function groupWholeDigits(digits: string): string {
  const normalized = digits.replace(/^0+(?=\d)/, '') || '0';
  const groups: string[] = [];

  for (let end = normalized.length; end > 0; end -= 3) {
    groups.unshift(normalized.slice(Math.max(0, end - 3), end));
  }

  return groups.join(',');
}

/** Normalizes direct keyboard input into a grouped amount string. */
export function normalizeAmountInput(input: string): string {
  const cleaned = input.replace(/,/g, '').replace(/[^\d.]/g, '');
  if (cleaned === '') {
    return '';
  }

  const [whole = '', ...fractionParts] = cleaned.split('.');
  const hasDecimal = cleaned.includes('.');
  const groupedWhole = groupWholeDigits(whole);

  if (!hasDecimal) {
    return groupedWhole;
  }

  return `${groupedWhole}.${fractionParts.join('')}`;
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
  amount,
  balances,
  displayToken,
  inputSymbol,
  isGmxPath,
  onAmountChange,
  onUnitChange,
  selectedTokenSymbol,
  onSelectToken,
  selectedDepositPath,
  unit,
}: {
  amount: string;
  balances: InvestableBalancesState;
  displayToken: DesktopDepositToken;
  inputSymbol: string;
  isGmxPath: boolean;
  onAmountChange: (amount: string) => void;
  onUnitChange: (unit: AmountUnit) => void;
  selectedTokenSymbol: string;
  onSelectToken: (token: DesktopDepositToken, usdPrice: number | null) => void;
  selectedDepositPath: DesktopDepositPath;
  unit: AmountUnit;
}) {
  const showBalancesSkeleton = balances.isConnected && balances.isLoading;

  return (
    <Card className="mx-5 mt-[30px] rounded-[22px]" style={cardStyle}>
      <div className="px-4 py-4">
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

        <div
          className="mt-3 rounded-[18px] p-3"
          style={{
            background: 'rgba(255,255,255,.035)',
            border: '1px solid rgba(255,255,255,.08)',
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <label
                htmlFor="invest-amount"
                className="font-mono text-[9.5px] uppercase tracking-[.09em] text-ink-faint"
              >
                Amount
              </label>
              <div className="mt-1 flex items-baseline">
                {unit === 'USD' ? (
                  <span className="mr-1 font-serif text-[30px] leading-none text-ink">
                    $
                  </span>
                ) : null}
                <input
                  id="invest-amount"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  aria-label="Investment amount"
                  value={amount}
                  onChange={(event) =>
                    onAmountChange(
                      normalizeAmountInput(event.currentTarget.value),
                    )
                  }
                  placeholder="0"
                  className="min-w-0 flex-1 bg-transparent font-serif text-[46px] leading-none text-ink outline-none placeholder:text-ink-faint"
                  style={{ letterSpacing: '-.02em' }}
                />
                {unit === 'Token' ? (
                  <span className="ml-1 text-[18px] font-semibold text-ink-dim">
                    {inputSymbol}
                  </span>
                ) : null}
              </div>
            </div>

            <div
              className="shrink-0 rounded-2xl px-3 py-2"
              style={{
                background: 'rgba(10,10,10,.42)',
                border: '1px solid rgba(212,197,163,.18)',
              }}
            >
              <div className="flex items-center gap-2">
                <TokenIcon
                  glyph={displayToken.glyph}
                  bg={displayToken.iconBg}
                  size={24}
                />
                <span className="text-[13px] font-semibold text-ink">
                  {inputSymbol}
                </span>
              </div>
              <div className="mt-[5px] font-mono text-[9px] uppercase tracking-[.08em] text-ink-faint">
                {depositPathChainLabel(selectedDepositPath)}
              </div>
            </div>
          </div>

          <div
            className="mt-3 inline-flex rounded-full p-[3px]"
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
                  onClick={() => onUnitChange(option)}
                  className="zp-tap rounded-full px-[15px] py-1.5 text-[12px]"
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

/** Invest step 1/3 — amount input, USD/Token toggle, source tokens, route. */
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
  const displayToken = isGmxPath ? BASE_DEPOSIT_TOKENS[0] : selectedToken;

  const handleReview = () => {
    const reviewAmountUsd = amountUsd;
    if (reviewAmountUsd === null || !hasSelectedSource) {
      return;
    }
    setAmountUsd(reviewAmountUsd);
    setSelectedTokenUsdPrice(isGmxPath ? 1 : (selectedRow?.usdPrice ?? null));
    void navigate('/invest/route');
  };

  return (
    <div className="font-sans text-ink">
      <StepHeader title="Start investing" step="STEP 1 OF 3 · AMOUNT" />
      <StepProgress current={1} />

      <HoldingsCard
        amount={amount}
        balances={balances}
        displayToken={displayToken}
        inputSymbol={inputSymbol}
        isGmxPath={isGmxPath}
        onAmountChange={setAmount}
        onUnitChange={setUnit}
        selectedTokenSymbol={selectedToken.symbol}
        selectedDepositPath={selectedDepositPath}
        onSelectToken={(token, usdPrice) => {
          setSelectedToken(token);
          setSelectedTokenUsdPrice(usdPrice);
        }}
        unit={unit}
      />

      <DepositPathSelector
        selectedDepositPath={selectedDepositPath}
        onSelect={setSelectedDepositPath}
      />

      <div className="px-5 pt-[18px]">
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
