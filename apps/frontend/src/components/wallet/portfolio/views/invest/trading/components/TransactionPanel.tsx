import type { GmxV2MarketKey } from '@zapengine/intent-engine';
import { useState } from 'react';
import { type Address, parseUnits } from 'viem';
import { arbitrum, base } from 'viem/chains';

import { useTransactionForm } from '@/components/wallet/portfolio/modals/hooks/useTransactionForm';
import { useTransactionSubmission } from '@/components/wallet/portfolio/modals/hooks/useTransactionSubmission';
import { useWatchedTransactionData } from '@/components/wallet/portfolio/modals/hooks/useWatchedTransactionData';
import {
  type TokenBalanceQuery,
  useTokenBalances,
} from '@/hooks/queries/wallet/useTokenBalances';
import { useGmxV2Deposit } from '@/hooks/useGmxV2Deposit';
import { useInvestStrategy } from '@/hooks/useInvestStrategy';
import { cn } from '@/lib/ui/classNames';
import { useWalletProvider } from '@/providers/WalletProvider';
import { transactionServiceMock } from '@/services';
import type { TransactionToken } from '@/types/domain/transaction';
import { formatCurrency, formatNumber } from '@/utils';
import { formatAddress } from '@/utils/formatting/address';

import { BaseTradingPanel } from './BaseTradingPanel';

const MODE_CONFIG = {
  deposit: {
    subtitle: 'Add capital to your strategy.',
    buttonLabel: 'Deposit',
    reviewTitle: 'Confirm Deposit',
    submitFn: transactionServiceMock.simulateDeposit,
  },
  withdraw: {
    subtitle: 'Withdraw funds to your wallet.',
    buttonLabel: 'Withdrawal',
    reviewTitle: 'Confirm Withdrawal',
    submitFn: transactionServiceMock.simulateWithdraw,
  },
} as const;

const GMX_V2_DEV_MARKETS = [
  { key: 'btc-btc', label: 'BTC/BTC' },
  { key: 'eth-eth', label: 'ETH/ETH' },
  { key: 'btc-usdc', label: 'BTC/USDC' },
  { key: 'eth-usdc', label: 'ETH/USDC' },
] as const satisfies readonly {
  key: GmxV2MarketKey;
  label: string;
}[];

function MinimalInput({
  label,
  value,
  onChange,
  suffix,
}: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  suffix?: React.ReactNode;
}) {
  return (
    <div className="group">
      <label className="block text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide group-focus-within:text-indigo-500 transition-colors">
        {label}
      </label>
      <div className="flex items-baseline gap-2 border-b border-gray-200 dark:border-gray-800 pb-2 group-focus-within:border-indigo-500 transition-all">
        <input
          type="text"
          value={value}
          onChange={onChange}
          className="bg-transparent text-3xl font-light text-gray-900 dark:text-white w-full outline-none placeholder:text-gray-300"
          placeholder="0.00"
        />
        {suffix}
      </div>
    </div>
  );
}

function chainName(chainId: number): string {
  if (chainId === base.id) return 'Base';
  if (chainId === 1) return 'Ethereum';
  if (chainId === 42161) return 'Arbitrum';
  return `Chain ${chainId}`;
}

function formatBaseUnits(value: string): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
  }).format(Number(value));
}

function TokenBalanceReadout({
  query,
  isConnected,
}: {
  query: TokenBalanceQuery | undefined;
  isConnected: boolean;
}) {
  if (!isConnected) {
    return (
      <span className="text-xs text-gray-400 dark:text-gray-500">
        Connect wallet
      </span>
    );
  }

  if (!query || query.isPending) {
    return (
      <div className="flex flex-col items-end gap-1.5">
        <div className="h-3.5 w-16 rounded bg-gray-200 dark:bg-gray-700 animate-pulse" />
        <div className="h-2.5 w-10 rounded bg-gray-100 dark:bg-gray-800 animate-pulse" />
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <span className="text-sm tabular-nums text-gray-400 dark:text-gray-500">
        —
      </span>
    );
  }

  return (
    <div className="flex flex-col items-end leading-tight">
      <span className="text-sm font-medium tabular-nums text-gray-900 dark:text-white">
        {formatNumber(Number.parseFloat(query.data.balance), {
          smartPrecision: true,
        })}
      </span>
      <span className="text-xs tabular-nums text-gray-400 dark:text-gray-500">
        {formatCurrency(query.data.usdValue, { smartPrecision: true })}
      </span>
    </div>
  );
}

function TokenSelectorRow({
  token,
  selected,
  query,
  isConnected,
  onSelect,
}: {
  token: TransactionToken;
  selected: boolean;
  query: TokenBalanceQuery | undefined;
  isConnected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl border text-left transition-all',
        selected
          ? 'border-indigo-500/60 bg-indigo-50/60 dark:bg-indigo-500/10 ring-1 ring-indigo-500/30'
          : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 hover:bg-gray-50/70 dark:hover:bg-gray-800/40',
      )}
    >
      <span className="flex items-center gap-3 min-w-0">
        <span
          className={cn(
            'w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-sm font-semibold transition-colors',
            selected
              ? 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-300'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400',
          )}
        >
          {token.symbol.charAt(0)}
        </span>
        <span className="flex flex-col min-w-0">
          <span
            className={cn(
              'text-sm font-semibold truncate',
              selected
                ? 'text-indigo-600 dark:text-indigo-300'
                : 'text-gray-900 dark:text-white',
            )}
          >
            {token.symbol}
          </span>
          <span className="text-xs text-gray-400 dark:text-gray-500 truncate">
            {token.name}
          </span>
        </span>
      </span>
      <TokenBalanceReadout query={query} isConnected={isConnected} />
    </button>
  );
}

export function TransactionPanel({ mode }: { mode: 'deposit' | 'withdraw' }) {
  const { isConnected } = useWalletProvider();
  const [isReviewOpen, setIsReviewOpen] = useState(false);

  const form = useTransactionForm({ chainId: base.id });
  const { amount, transactionData } = useWatchedTransactionData(form, true);

  const config = MODE_CONFIG[mode];

  const submission = useTransactionSubmission(
    form,
    isConnected,
    transactionData.selectedToken,
    config.submitFn,
    () => setIsReviewOpen(false),
  );

  const tokens = transactionData.tokenQuery.data ?? [];
  const { byAddress: balancesByAddress } = useTokenBalances(base.id, tokens);

  return (
    <BaseTradingPanel
      title={<span className="capitalize">{mode}</span>}
      subtitle={config.subtitle}
      footer={
        <>
          <button
            onClick={() => setIsReviewOpen(true)}
            disabled={!amount || parseFloat(amount) <= 0}
            className="w-full py-4 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-black font-medium hover:opacity-90 transition-opacity flex items-center justify-center gap-2 shadow-lg shadow-gray-200 dark:shadow-none disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Review {config.buttonLabel}
          </button>

          {mode === 'deposit' && import.meta.env.DEV ? (
            <>
              <InvestStrategyButton
                amount={amount}
                selectedToken={transactionData.selectedToken}
              />
              <GmxV2TestButtons amount={amount} />
            </>
          ) : null}
        </>
      }
      isReviewOpen={isReviewOpen}
      onCloseReview={() => setIsReviewOpen(false)}
      onConfirmReview={submission.handleSubmit}
      isSubmitting={submission.isSubmitting}
      reviewTitle={config.reviewTitle}
    >
      <MinimalInput
        label="Amount"
        value={amount}
        onChange={(e) => form.setValue('amount', e.target.value)}
        suffix={<span className="text-sm font-medium text-gray-400">USD</span>}
      />

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide">
            Select Asset
          </label>
          <span className="text-[10px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500 border border-gray-200 dark:border-gray-800 rounded-full px-2 py-0.5">
            Base
          </span>
        </div>
        <div className="space-y-2">
          {transactionData.tokenQuery.isLoading
            ? Array.from({ length: 2 }).map((_, i) => (
                <div
                  key={i}
                  className="h-[60px] rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/40 animate-pulse"
                />
              ))
            : tokens.slice(0, 8).map((token) => (
                <TokenSelectorRow
                  key={token.address}
                  token={token}
                  selected={
                    transactionData.selectedToken?.address === token.address
                  }
                  query={balancesByAddress.get(token.address)}
                  isConnected={isConnected}
                  onSelect={() =>
                    form.setValue('tokenAddress', token.address)
                  }
                />
              ))}
        </div>
      </div>
    </BaseTradingPanel>
  );
}

function GmxV2TestButtons({ amount }: { amount: string }) {
  const { chain } = useWalletProvider();
  const {
    run,
    pending,
    lastError,
    lastTxHash,
    lastTxHashes,
    lastPlan,
    steps,
    getErrorMessage,
  } = useGmxV2Deposit();
  const isOnArbitrum = chain?.id === arbitrum.id;

  const handleRun = async (marketKey: GmxV2MarketKey) => {
    try {
      await run({
        marketKey,
        amount: parseUnits(amount, 6).toString(),
      });
    } catch {
      // The hook logs and stores the error for this debug panel.
    }
  };

  const disabled = pending || !amount || parseFloat(amount) <= 0;

  return (
    <div className="mt-4 p-3 border border-dashed border-amber-300 bg-amber-50/70 dark:bg-amber-950/20 rounded-lg text-xs">
      <div className="font-mono text-amber-700 dark:text-amber-300 mb-2">
        GMX v2 GM deposits · Arbitrum USDC
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {GMX_V2_DEV_MARKETS.map((market) => (
          <button
            key={market.key}
            type="button"
            onClick={() => void handleRun(market.key)}
            disabled={disabled}
            className="px-3 py-1.5 rounded bg-amber-500 text-white disabled:opacity-50 text-left"
          >
            {pending
              ? 'Running...'
              : !isOnArbitrum
                ? `Switch to Arbitrum & Deposit GM ${market.label}`
                : `Deposit GM ${market.label}`}
          </button>
        ))}
      </div>
      {lastPlan ? (
        <div className="mt-2 text-amber-700 dark:text-amber-300">
          Market: {lastPlan.market.name} · fee {lastPlan.executionFeeWei} wei
        </div>
      ) : null}
      {steps.length ? (
        <div className="mt-2 space-y-1 text-gray-700 dark:text-gray-300">
          {steps.map((step) => (
            <div key={step.index}>
              {step.label} · {step.status}
              {step.txHash ? (
                <>
                  {' '}
                  ·{' '}
                  <code className="font-mono">
                    {formatAddress(step.txHash)}
                  </code>
                </>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      {lastTxHash ? (
        <div className="mt-2 text-gray-700 dark:text-gray-300">
          GMX deposit confirmed ·{' '}
          <a
            href={`https://arbiscan.io/tx/${lastTxHash}`}
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            <code className="font-mono">{formatAddress(lastTxHash)}</code>
          </a>
        </div>
      ) : null}
      {lastTxHashes.length > 1 ? (
        <div className="mt-1 text-gray-600 dark:text-gray-400">
          {lastTxHashes.length} transactions confirmed
        </div>
      ) : null}
      {lastTxHash ? (
        <div className="mt-1 text-gray-600 dark:text-gray-400">
          GM minted by keeper - verify in GMX UI
        </div>
      ) : null}
      {lastError ? (
        <pre className="mt-2 text-red-500 whitespace-pre-wrap break-all">
          {getErrorMessage(lastError)}
        </pre>
      ) : null}
    </div>
  );
}

function InvestStrategyButton({
  amount,
  selectedToken,
}: {
  amount: string;
  selectedToken: TransactionToken | null;
}) {
  const { chain } = useWalletProvider();
  const {
    run,
    pending,
    lastError,
    tier,
    lastTxHash,
    lastTxHashes,
    lastCallsId,
    lastPlan,
    legs,
    getErrorMessage,
  } = useInvestStrategy();
  const isOnBase = chain?.id === base.id;

  const handleRun = async () => {
    try {
      if (!selectedToken) {
        throw new Error('Select a token first');
      }

      await run({
        fromToken: selectedToken.address as Address,
        fromAmount: parseUnits(amount, selectedToken.decimals).toString(),
        sourceChainId: base.id,
      });
    } catch {
      // The hook logs and stores the error for this debug panel.
    }
  };

  const tierLabel =
    tier === 'eip7702'
      ? 'EIP-7702'
      : tier === 'sequential'
        ? 'Sequential'
        : null;
  const resultId = lastCallsId ?? lastTxHash;
  const disabled =
    pending || !selectedToken || !amount || parseFloat(amount) <= 0;
  const progressByLeg = new Map(
    legs.map((leg) => [`${leg.kind}-${leg.chainId}`, leg]),
  );

  return (
    <div className="mt-4 p-3 border border-dashed border-amber-300 bg-amber-50/70 dark:bg-amber-950/20 rounded-lg text-xs">
      <div className="font-mono text-amber-700 dark:text-amber-300 mb-2">
        Invest deposit route · Base source
      </div>
      <button
        type="button"
        onClick={() => void handleRun()}
        disabled={disabled}
        className="px-3 py-1.5 rounded bg-amber-500 text-white disabled:opacity-50"
      >
        {pending
          ? 'Running...'
          : !isOnBase
            ? 'Switch to Base & Invest'
            : 'Invest strategy'}
      </button>
      {tierLabel ? (
        <div className="mt-2 text-amber-700 dark:text-amber-300">
          Tier: {tierLabel}
        </div>
      ) : null}
      {lastPlan?.legs.length ? (
        <div className="mt-2 space-y-1 text-gray-700 dark:text-gray-300">
          {lastPlan.legs.map((leg) => (
            <div key={`${leg.kind}-${leg.chainId}`}>
              {leg.kind === 'supply' ? 'Supply' : 'Bridge'} ·{' '}
              {chainName(leg.chainId)} · {formatBaseUnits(leg.fromAmount)} ·{' '}
              {progressByLeg.get(`${leg.kind}-${leg.chainId}`)?.status ??
                'pending'}
            </div>
          ))}
        </div>
      ) : null}
      {resultId ? (
        <div className="mt-2 text-gray-700 dark:text-gray-300">
          Sent · <code className="font-mono">{formatAddress(resultId)}</code>
        </div>
      ) : null}
      {tier === 'sequential' && lastTxHashes.length > 1 ? (
        <div className="mt-1 text-gray-600 dark:text-gray-400">
          {lastTxHashes.length} transactions confirmed
        </div>
      ) : null}
      {lastError ? (
        <pre className="mt-2 text-red-500 whitespace-pre-wrap break-all">
          {getErrorMessage(lastError)}
        </pre>
      ) : null}
    </div>
  );
}
