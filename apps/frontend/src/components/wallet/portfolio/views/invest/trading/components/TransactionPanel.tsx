import type { GmxV2MarketKey } from '@zapengine/intent-engine';
import { type ReactNode, useState } from 'react';
import { type Address, type Hash, parseUnits } from 'viem';
import { arbitrum, base } from 'viem/chains';

import { TokenAmountField, TokenSelectorList } from '@/components/shared/token';
import { useTransactionForm } from '@/components/wallet/portfolio/modals/hooks/useTransactionForm';
import { useTransactionSubmission } from '@/components/wallet/portfolio/modals/hooks/useTransactionSubmission';
import { useWatchedTransactionData } from '@/components/wallet/portfolio/modals/hooks/useWatchedTransactionData';
import { getChainName } from '@/constants/chains';
import { useTokenBalances } from '@/hooks/queries/wallet/useTokenBalances';
import { useGmxDeposit } from '@/hooks/useGmxDeposit';
import { useInvestStrategy } from '@/hooks/useInvestStrategy';
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

const GMX_V2_DEV_MARKETS = [
  { key: 'btc-btc', label: 'BTC/BTC' },
  { key: 'eth-eth', label: 'ETH/ETH' },
  { key: 'btc-usdc', label: 'BTC/USDC' },
  { key: 'eth-usdc', label: 'ETH/USDC' },
] as const satisfies readonly {
  key: GmxV2MarketKey;
  label: string;
}[];

function formatBaseUnits(value: string): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
  }).format(Number(value));
}

type ExecutionTier = 'eip7702' | 'sequential' | null;

interface DebugExecutionState {
  tier: ExecutionTier;
  lastTxHash: Hash | null;
  lastTxHashes: Hash[];
  lastError: unknown;
  getErrorMessage: (e: unknown) => string;
}

function DebugExecutionPanel({
  title,
  tier,
  lastTxHash,
  lastTxHashes,
  lastError,
  getErrorMessage,
  explorerBaseUrl,
  renderDetails,
}: DebugExecutionState & {
  title: string;
  explorerBaseUrl: (hash: Hash) => string;
  renderDetails: () => ReactNode;
}) {
  const tierLabel =
    tier === 'eip7702'
      ? 'EIP-7702'
      : tier === 'sequential'
        ? 'Sequential'
        : null;

  return (
    <div className="mt-4 p-3 border border-dashed border-amber-300 bg-amber-50/70 dark:bg-amber-950/20 rounded-lg text-xs">
      <div className="font-mono text-amber-700 dark:text-amber-300 mb-2">
        {title}
      </div>
      {tierLabel ? (
        <div className="mt-2 text-amber-700 dark:text-amber-300">
          Tier: {tierLabel}
        </div>
      ) : null}
      {renderDetails()}
      {lastTxHash || lastTxHashes.length > 0 ? (
        <div className="mt-2 text-gray-700 dark:text-gray-300">
          {lastTxHash ? (
            <span>
              Sent ·{' '}
              <a
                href={explorerBaseUrl(lastTxHash)}
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                <code className="font-mono">{formatAddress(lastTxHash)}</code>
              </a>
            </span>
          ) : lastTxHashes.length > 0 ? (
            <span>
              {lastTxHashes.length} transaction
              {lastTxHashes.length === 1 ? '' : 's'} submitted
            </span>
          ) : null}
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

function ExecutionDebugPanel({
  execution,
  title,
  explorerBaseUrl,
  renderDetails,
}: {
  execution: DebugExecutionState;
  title: string;
  explorerBaseUrl: (hash: Hash) => string;
  renderDetails: () => ReactNode;
}) {
  return (
    <DebugExecutionPanel
      title={title}
      tier={execution.tier}
      lastTxHash={execution.lastTxHash}
      lastTxHashes={execution.lastTxHashes}
      lastError={execution.lastError}
      getErrorMessage={execution.getErrorMessage}
      explorerBaseUrl={explorerBaseUrl}
      renderDetails={renderDetails}
    />
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
  const selectedBalanceQuery = transactionData.selectedToken
    ? balancesByAddress.get(transactionData.selectedToken.address)
    : undefined;
  const selectedBalanceData = selectedBalanceQuery?.data;
  const selectedBalance = selectedBalanceData
    ? Number.parseFloat(selectedBalanceData.balance)
    : undefined;
  const selectedUsdPrice =
    selectedBalanceData &&
    selectedBalance !== undefined &&
    Number.isFinite(selectedBalance) &&
    selectedBalance > 0
      ? selectedBalanceData.usdValue / selectedBalance
      : transactionData.selectedToken?.usdPrice;

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
      <TokenAmountField
        amount={amount}
        onAmountChange={(value) =>
          form.setValue('amount', value, { shouldValidate: true })
        }
        token={transactionData.selectedToken}
        usdPrice={selectedUsdPrice}
        balance={selectedBalance}
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
          <TokenSelectorList
            tokens={tokens}
            selectedAddress={transactionData.selectedToken?.address}
            balancesByAddress={balancesByAddress}
            isConnected={isConnected}
            isLoading={transactionData.tokenQuery.isLoading}
            onSelect={(address) => form.setValue('tokenAddress', address)}
          />
        </div>
      </div>
    </BaseTradingPanel>
  );
}

function GmxV2TestButtons({ amount }: { amount: string }) {
  const { chain } = useWalletProvider();
  const gmx = useGmxDeposit();
  const { run, pending, lastCallsId, lastTxHash, lastPlan, steps } = gmx;
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
  const resultId = lastCallsId ?? lastTxHash;

  return (
    <ExecutionDebugPanel
      execution={gmx}
      title="GMX v2 GM deposits · Arbitrum USDC"
      explorerBaseUrl={(hash) => `https://arbiscan.io/tx/${hash}`}
      renderDetails={() => (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
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
              GMX plan · {formatBaseUnits(lastPlan.legs[0]?.fromAmount ?? '0')}{' '}
              base units
            </div>
          ) : null}
          {steps.length ? (
            <div className="mt-2 space-y-1 text-gray-700 dark:text-gray-300">
              {steps.map((step) => (
                <div key={step.index}>
                  {step.label} · {step.status}
                  {step.txHash ? (
                    <>
                      {' · '}
                      <code className="font-mono">
                        {formatAddress(step.txHash)}
                      </code>
                    </>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
          {resultId ? (
            <div className="mt-2 text-gray-700 dark:text-gray-300">
              GMX deposit submitted ·{' '}
              {lastTxHash ? (
                <a
                  href={`https://arbiscan.io/tx/${lastTxHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  <code className="font-mono">{formatAddress(lastTxHash)}</code>
                </a>
              ) : (
                <code className="font-mono">{formatAddress(resultId)}</code>
              )}
            </div>
          ) : null}
          {resultId ? (
            <div className="mt-1 text-gray-600 dark:text-gray-400">
              GM minted by keeper - verify in GMX UI
            </div>
          ) : null}
        </>
      )}
    />
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
  const investStrategy = useInvestStrategy();
  const { run, pending, lastCallsId, lastTxHash, lastPlan, legs } =
    investStrategy;
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

  const resultId = lastCallsId ?? lastTxHash;
  const disabled =
    pending || !selectedToken || !amount || parseFloat(amount) <= 0;
  const progressByLeg = new Map(
    legs.map((leg) => [`${leg.kind}-${leg.chainId}`, leg]),
  );

  return (
    <ExecutionDebugPanel
      execution={investStrategy}
      title="Invest deposit route · Base source"
      explorerBaseUrl={(hash) => `https://basescan.io/tx/${hash}`}
      renderDetails={() => (
        <>
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
          {lastPlan?.legs.length ? (
            <div className="mt-2 space-y-1 text-gray-700 dark:text-gray-300">
              {lastPlan.legs.map((leg) => (
                <div key={`${leg.kind}-${leg.chainId}`}>
                  {leg.kind === 'supply' ? 'Supply' : 'Bridge'} ·{' '}
                  {getChainName(leg.chainId)} ·{' '}
                  {formatBaseUnits(leg.fromAmount)} ·{' '}
                  {progressByLeg.get(`${leg.kind}-${leg.chainId}`)?.status ??
                    'pending'}
                </div>
              ))}
            </div>
          ) : null}
          {resultId ? (
            <div className="mt-2 text-gray-700 dark:text-gray-300">
              Sent ·{' '}
              <code className="font-mono">{formatAddress(resultId)}</code>
            </div>
          ) : null}
        </>
      )}
    />
  );
}
