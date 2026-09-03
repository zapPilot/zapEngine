import { hlpStepFromPlan } from '@zapengine/app-core/lib/wallet/depositWizardMachine';
import type {
  DepositPlan,
  PlanOrchestrationDepositPlan,
} from '@zapengine/types/api';
import { formatUnits } from 'viem';

import { Card } from '@/components/ui/Card';
import { InfoRow } from '@/components/ui/InfoRow';
import type { SingleChainFundingDraft } from '@/integration/useInvest';
import { formatPlanGas } from '@/integration/planPreviewFormatters';
import { isStrategyDepositPlan } from '@/integration/simulationPreviewModel';
import { formatUsd } from '@/lib/format';

function asDepositPlan(
  plan: PlanOrchestrationDepositPlan | undefined,
): DepositPlan | undefined {
  if (!plan || isStrategyDepositPlan(plan)) return undefined;
  return plan;
}

function usd6Label(value: string | undefined): string {
  if (!value) return '—';
  return `${formatUnits(BigInt(value), 6)} USDC`;
}

function compactAddress(value: string | undefined): string {
  if (!value) return '—';
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

export function HlpPlanSummary({
  plan: orchestrationPlan,
  amountUsd,
  singleChainFundingDraft,
}: {
  plan: PlanOrchestrationDepositPlan | undefined;
  amountUsd: number;
  singleChainFundingDraft: SingleChainFundingDraft | null;
}) {
  const plan = asDepositPlan(orchestrationPlan);
  const step = plan ? hlpStepFromPlan(plan) : null;
  const bridgeLeg = plan?.legs.find(
    (leg) => leg.kind === 'bridge' && leg.protocol === 'hyperliquid',
  );
  const transactionCount =
    (plan?.approvals.length ?? 0) + (plan?.calls.length ?? 0);

  return (
    <Card className="mt-5 p-4">
      <InfoRow label="Total" value={formatUsd(amountUsd)} divider />
      <InfoRow
        label="Funding"
        value={`${usd6Label(singleChainFundingDraft?.fromAmount)} · Base`}
        divider
      />
      <InfoRow label="Route" value="Base → Hyperliquid" divider />
      <InfoRow
        label="Expected received"
        value={usd6Label(bridgeLeg?.toAmountMin ?? step?.expectedUsd)}
        divider
      />
      <InfoRow
        label="HLP minimum"
        value={usd6Label(step?.minDepositUsd)}
        divider
      />
      <InfoRow
        label="Official HLP vault"
        value={compactAddress(step?.action.vaultAddress)}
        divider
      />
      <InfoRow
        label="Withdrawal lock"
        value={step ? `${step.lockupDays} days after deposit` : '—'}
        divider
      />
      <InfoRow
        label="Source transactions"
        value={String(transactionCount)}
        divider
      />
      <InfoRow label="Source gas" value={formatPlanGas(plan?.totalGasUsd)} />
    </Card>
  );
}
