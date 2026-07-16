import type { StrategyDepositPlan } from '@zapengine/types/api';
import { formatEther, formatUnits } from 'viem';

import { Card } from '@/components/ui/Card';
import { InfoRow } from '@/components/ui/InfoRow';
import type { DesktopDepositToken } from '@/integration/depositTokens';
import { formatPlanGas } from '@/integration/planPreviewFormatters';
import { formatUsd } from '@/lib/format';

interface StrategyPlanSummaryProps {
  variant: 'route' | 'confirm';
  plan: StrategyDepositPlan | undefined;
  amountUsd: number;
  baseToken: DesktopDepositToken;
  arbitrumToken: DesktopDepositToken;
}

function planTransactionCount(plan: StrategyDepositPlan | undefined): number {
  return (
    plan?.executionGroups.reduce(
      (count, group) => count + group.approvals.length + group.calls.length,
      0,
    ) ?? 0
  );
}

function groupActionLabel(
  group: StrategyDepositPlan['executionGroups'][number] | undefined,
): string {
  if (!group) return '—';
  const transactions = [...group.approvals, ...group.calls];
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

function executionFeeLabel(plan: StrategyDepositPlan | undefined): string {
  if (!plan) return '—';
  const group = plan.executionGroups.find(
    (candidate) => candidate.id === 'arbitrum-gmx',
  );
  const executionFee = (group?.calls ?? []).reduce((total, transaction) => {
    const route = transaction.meta.route;
    const isGmxDeposit =
      typeof route === 'object' && route !== null && 'marketKey' in route;
    return isGmxDeposit ? total + BigInt(transaction.value) : total;
  }, 0n);
  return `${formatEther(executionFee)} ETH total`;
}

export function StrategyPlanSummary({
  variant,
  plan,
  amountUsd,
  baseToken,
  arbitrumToken,
}: StrategyPlanSummaryProps) {
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
    <Card className="mt-5 p-4">
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
      <InfoRow
        label="Base actions"
        value={groupActionLabel(baseGroup)}
        divider
      />
      <InfoRow
        label="Arbitrum actions"
        value={groupActionLabel(arbitrumGroup)}
        divider
      />
      <InfoRow
        label="Transactions"
        value={String(planTransactionCount(plan))}
        divider
      />
      <InfoRow label="Gas" value={formatPlanGas(plan?.totalGasUsd)} divider />
      <InfoRow
        label="GMX execution fee"
        value={executionFeeLabel(plan)}
        divider={variant === 'confirm'}
      />
      {variant === 'confirm' ? (
        <InfoRow label="Settlement" value="Up to 5 minutes" />
      ) : null}
    </Card>
  );
}
