import {
  type DepositPlan,
  type PlanOrchestrationDepositPlan,
  type PreparedTransaction,
  type StrategyDepositPlan,
  SUPPORTED_DEPOSIT_CHAINS,
} from '@zapengine/types/api';
import { formatEther, formatUnits } from 'viem';

import { Card } from '@/components/ui/Card';
import { InfoRow } from '@/components/ui/InfoRow';
import {
  DEFAULT_ARBITRUM_FUNDING_TOKEN,
  type DesktopDepositToken,
} from '@/integration/depositTokens';
import type {
  InvestScope,
  SingleChainFundingDraft,
} from '@/integration/useInvest';
import { formatPlanGas } from '@/integration/planPreviewFormatters';
import { formatUsd } from '@/lib/format';

interface StrategyPlanSummaryProps {
  variant: 'route' | 'confirm';
  plan: PlanOrchestrationDepositPlan | undefined;
  amountUsd: number;
  scope: InvestScope;
  singleChainFundingDraft: SingleChainFundingDraft | null;
  baseToken: DesktopDepositToken;
  arbitrumToken: DesktopDepositToken;
}

function isStrategyDepositPlan(
  plan: PlanOrchestrationDepositPlan | undefined,
): plan is StrategyDepositPlan {
  return Boolean(plan && 'executionGroups' in plan);
}

export function isDepositPlanForScope(
  plan: PlanOrchestrationDepositPlan | undefined,
  scope: InvestScope,
): boolean {
  if (scope === 'both') {
    return isStrategyDepositPlan(plan);
  }
  if (!plan || isStrategyDepositPlan(plan)) {
    return false;
  }
  return (
    plan.sourceChainId ===
    (scope === 'base'
      ? SUPPORTED_DEPOSIT_CHAINS.BASE
      : SUPPORTED_DEPOSIT_CHAINS.ARBITRUM)
  );
}

function transactionActionLabel(
  approvals: readonly PreparedTransaction[] | undefined,
  calls: readonly PreparedTransaction[] | undefined,
): string {
  if (!approvals || !calls) return '—';
  const transactions = [...approvals, ...calls];
  const approvalCount = transactions.filter((transaction) =>
    ['APPROVAL', 'ERC20_APPROVE'].includes(transaction.meta.intentType),
  ).length;
  const swapCount = transactions.filter(
    (transaction) => transaction.meta.intentType === 'SWAP',
  ).length;
  const depositCount = transactions.filter(
    (transaction) => transaction.meta.intentType === 'SUPPLY',
  ).length;
  const parts = [
    approvalCount > 0 ? `${approvalCount} approve` : null,
    swapCount > 0 ? `${swapCount} swap` : null,
    depositCount > 0 ? `${depositCount} deposit` : null,
  ].filter((part): part is string => part !== null);
  return parts.join(' · ') || 'No wallet actions';
}

function compactDecimal(value: string, maximumFractionDigits: number): string {
  const [whole = '0', fraction = ''] = value.split('.');
  const compactFraction = fraction
    .slice(0, maximumFractionDigits)
    .replace(/0+$/u, '');
  return compactFraction ? `${whole}.${compactFraction}` : whole;
}

function tokenAmountLabel(
  amount: string | undefined,
  token: DesktopDepositToken,
): string {
  if (!amount) return `— ${token.symbol}`;
  return `${compactDecimal(
    formatUnits(BigInt(amount), token.decimals),
    token.symbol === 'ETH' ? 6 : 2,
  )} ${token.symbol}`;
}

function strategyTransactionCount(
  plan: StrategyDepositPlan | undefined,
): number {
  return (
    plan?.executionGroups.reduce(
      (count, group) => count + group.approvals.length + group.calls.length,
      0,
    ) ?? 0
  );
}

function executionFeeLabel(
  calls: readonly PreparedTransaction[] | undefined,
): string {
  if (!calls) return '—';
  const executionFee = calls.reduce((total, transaction) => {
    const route = transaction.meta.route;
    const isGmxDeposit =
      typeof route === 'object' && route !== null && 'marketKey' in route;
    return isGmxDeposit ? total + BigInt(transaction.value) : total;
  }, 0n);
  return `${formatEther(executionFee)} ETH total`;
}

function StrategySummary({
  variant,
  plan,
  amountUsd,
  baseToken,
  arbitrumToken,
}: Omit<
  StrategyPlanSummaryProps,
  'scope' | 'singleChainFundingDraft' | 'plan'
> & {
  plan: StrategyDepositPlan | undefined;
}) {
  const baseGroup = plan?.executionGroups.find(
    (group) => group.id === 'base-morpho',
  );
  const arbitrumGroup = plan?.executionGroups.find(
    (group) => group.id === 'arbitrum-gmx',
  );
  const btcAllocation = plan?.allocations.find(
    (allocation) => allocation.id === 'gmx-btc-usdc',
  );
  const ethAllocation = plan?.allocations.find(
    (allocation) => allocation.id === 'gmx-eth-usdc',
  );

  return (
    <>
      {/* jscpd:ignore-start -- strategy and single-chain summaries intentionally share the same confirmation row shape */}
      {variant === 'confirm' ? (
        <>
          <InfoRow label="Total" value={formatUsd(amountUsd)} divider />
          <InfoRow
            label="Base · Morpho"
            value={`${tokenAmountLabel(baseGroup?.fromAmount, baseToken)} · 40%`}
            divider
          />
          <InfoRow
            label="Arbitrum · GMX BTC"
            value={`${tokenAmountLabel(btcAllocation?.fromAmount, arbitrumToken)} · 30%`}
            divider
          />
          <InfoRow
            label="Arbitrum · GMX ETH"
            value={`${tokenAmountLabel(ethAllocation?.fromAmount, arbitrumToken)} · 30%`}
            divider
          />
        </>
      ) : (
        <>
          <InfoRow
            label="Base funding"
            value={`${tokenAmountLabel(baseGroup?.fromAmount, baseToken)} · 40%`}
            divider
          />
          <InfoRow
            label="Arbitrum funding"
            value={`${tokenAmountLabel(arbitrumGroup?.fromAmount, arbitrumToken)} · 60%`}
            divider
          />
        </>
      )}
      {/* jscpd:ignore-end */}
      <InfoRow
        label="Base actions"
        value={transactionActionLabel(baseGroup?.approvals, baseGroup?.calls)}
        divider
      />
      <InfoRow
        label="Arbitrum actions"
        value={transactionActionLabel(
          arbitrumGroup?.approvals,
          arbitrumGroup?.calls,
        )}
        divider
      />
      <InfoRow
        label="Transactions"
        value={String(strategyTransactionCount(plan))}
        divider
      />
      <InfoRow label="Gas" value={formatPlanGas(plan?.totalGasUsd)} divider />
      <InfoRow
        label="GMX execution fee"
        value={executionFeeLabel(arbitrumGroup?.calls)}
        divider={variant === 'confirm'}
      />
      {/* jscpd:ignore-start -- strategy and single-chain summaries intentionally share the same confirmation row shape */}
      {variant === 'confirm' ? (
        <InfoRow label="Settlement" value="Up to 5 minutes" />
      ) : null}
    </>
  );
}

function SingleChainSummary({
  variant,
  plan,
  amountUsd,
  scope,
  singleChainFundingDraft,
  baseToken,
}: Omit<StrategyPlanSummaryProps, 'plan' | 'scope' | 'arbitrumToken'> & {
  plan: DepositPlan | undefined;
  scope: Exclude<InvestScope, 'both'>;
}) {
  const isBase = scope === 'base';
  const token = isBase ? baseToken : DEFAULT_ARBITRUM_FUNDING_TOKEN;
  const fromAmount =
    singleChainFundingDraft?.scope === scope
      ? singleChainFundingDraft.fromAmount
      : plan?.legs[0]?.fromAmount;
  const actionLabel = isBase ? 'Base actions' : 'Arbitrum actions';
  const allocationLabel = isBase ? 'Base · Morpho' : 'Arbitrum · GMX 4 pools';
  const fundingLabel = isBase ? 'Base funding' : 'Arbitrum funding';
  const transactionCount =
    (plan?.approvals.length ?? 0) + (plan?.calls.length ?? 0);

  return (
    <>
      {variant === 'confirm' ? (
        <>
          <InfoRow label="Total" value={formatUsd(amountUsd)} divider />
          <InfoRow
            label={allocationLabel}
            value={
              isBase
                ? `${tokenAmountLabel(fromAmount, token)} · 100%`
                : 'BTC/BTC · ETH/ETH · BTC/USDC · ETH/USDC · 25% each'
            }
            divider
          />
        </>
      ) : (
        <InfoRow
          label={fundingLabel}
          value={`${tokenAmountLabel(fromAmount, token)} · 100%`}
          divider
        />
      )}
      {/* jscpd:ignore-end */}
      <InfoRow
        label={actionLabel}
        value={transactionActionLabel(plan?.approvals, plan?.calls)}
        divider
      />
      <InfoRow label="Transactions" value={String(transactionCount)} divider />
      <InfoRow
        label="Gas"
        value={formatPlanGas(plan?.totalGasUsd)}
        divider={variant === 'confirm' || !isBase}
      />
      {!isBase ? (
        <InfoRow
          label="GMX execution fee"
          value={executionFeeLabel(plan?.calls)}
          divider={variant === 'confirm'}
        />
      ) : null}
      {variant === 'confirm' ? (
        <InfoRow
          label="Settlement"
          value={isBase ? 'On-chain confirmation' : 'Up to 5 minutes'}
        />
      ) : null}
    </>
  );
}

function depositPlan(
  plan: PlanOrchestrationDepositPlan | undefined,
): DepositPlan | undefined {
  if (!plan) return undefined;
  return isStrategyDepositPlan(plan) ? undefined : plan;
}

export function StrategyPlanSummary({
  variant,
  plan,
  amountUsd,
  scope,
  singleChainFundingDraft,
  baseToken,
  arbitrumToken,
}: StrategyPlanSummaryProps) {
  return (
    <Card className="mt-5 p-4">
      {scope === 'both' ? (
        <StrategySummary
          variant={variant}
          plan={isStrategyDepositPlan(plan) ? plan : undefined}
          amountUsd={amountUsd}
          baseToken={baseToken}
          arbitrumToken={arbitrumToken}
        />
      ) : (
        <SingleChainSummary
          variant={variant}
          plan={depositPlan(plan)}
          amountUsd={amountUsd}
          scope={scope}
          singleChainFundingDraft={singleChainFundingDraft}
          baseToken={baseToken}
        />
      )}
    </Card>
  );
}
