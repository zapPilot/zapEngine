import { useState } from 'react';
import { type Address, parseUnits } from 'viem';
import { base } from 'viem/chains';

import { useTransactionForm } from '@/components/wallet/portfolio/modals/hooks/useTransactionForm';
import { useTransactionSubmission } from '@/components/wallet/portfolio/modals/hooks/useTransactionSubmission';
import { useWatchedTransactionData } from '@/components/wallet/portfolio/modals/hooks/useWatchedTransactionData';
import { useInvestStrategy } from '@/hooks/useInvestStrategy';
import { cn } from '@/lib/ui/classNames';
import { useWalletProvider } from '@/providers/WalletProvider';
import { transactionServiceMock } from '@/services';
import type { TransactionToken } from '@/types/domain/transaction';
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
            <InvestStrategyButton
              amount={amount}
              selectedToken={transactionData.selectedToken}
            />
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
        <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide">
          Select Asset
        </label>
        <div className="flex flex-wrap gap-2">
          {transactionData.tokenQuery.isLoading
            ? Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="h-10 w-16 bg-gray-800/50 rounded-xl animate-pulse"
                />
              ))
            : transactionData.tokenQuery.data?.slice(0, 5).map((token) => (
                <button
                  key={token.address}
                  onClick={() => form.setValue('tokenAddress', token.address)}
                  className={cn(
                    'px-4 py-2.5 rounded-xl text-sm transition-all border font-medium',
                    transactionData.selectedToken?.address === token.address
                      ? 'bg-gray-900 dark:bg-white text-white dark:text-black border-transparent shadow-md'
                      : 'bg-gray-50 dark:bg-gray-800 border-transparent text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white',
                  )}
                >
                  {token.symbol}
                </button>
              ))}
        </div>
      </div>
    </BaseTradingPanel>
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
      : tier === 'permit-multicall3'
        ? 'Permit + Multicall3'
        : tier === 'sequential'
          ? 'Sequential'
          : null;
  const resultId = lastCallsId ?? lastTxHash;
  const disabled =
    pending ||
    !isOnBase ||
    !selectedToken ||
    !amount ||
    parseFloat(amount) <= 0;
  const disabledReason = !isOnBase
    ? 'Connect to Base - Ethereum/Arbitrum legs route through Base in v1'
    : null;
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
        title={disabledReason ?? undefined}
        className="px-3 py-1.5 rounded bg-amber-500 text-white disabled:opacity-50"
      >
        {!isOnBase
          ? 'Connect to Base'
          : pending
            ? 'Running...'
            : 'Invest strategy'}
      </button>
      {disabledReason ? (
        <div className="mt-2 text-amber-700 dark:text-amber-300">
          {disabledReason}
        </div>
      ) : null}
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
