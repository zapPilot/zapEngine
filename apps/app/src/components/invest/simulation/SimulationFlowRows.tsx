import { Icon } from '@/components/ui/Icon';
import type {
  PrivySimulationApproval,
  PrivySimulationAssetChange,
  PrivySimulationContract,
} from '@zapengine/types/api';
import { ShieldCheck } from 'lucide-react-native';
import { Text, View } from 'react-native';

import {
  SimulationAssetAmountRow,
  SimulationAssetSubtitle,
  SimulationAssetFlowSections,
  SimulationFlowSectionHeader,
  SimulationTokenMark,
} from '@/components/invest/simulation/SimulationFlowPrimitives';
import {
  compactTokenAmount,
  resolveAddressTarget,
  resolveAssetCounterparty,
} from '@/integration/simulationPreviewModel';

function ApproveRow({
  approval,
  contracts,
}: {
  approval: PrivySimulationApproval;
  contracts: readonly PrivySimulationContract[];
}) {
  const risky = approval.unlimited || approval.exceedsSimulatedSpend;
  const spenderLabel = resolveAddressTarget(approval.spender, contracts);

  return (
    <View className="flex-row items-center gap-3 border-t border-rule px-4 py-3 first:border-t-0">
      <SimulationTokenMark token={approval.token} />
      <View className="min-w-0 flex-1">
        <View className="flex-row items-center gap-1.5">
          <Text
            className="font-text-semibold text-body-sm text-ink"
            numberOfLines={1}
          >
            {approval.token.symbol}
          </Text>
          {risky ? (
            <View className="rounded-round border border-alert bg-alert-wash px-1.5 py-0.5">
              <Text className="font-mono-semibold text-data uppercase tracking-[.5px] text-alert">
                {approval.unlimited ? 'Unlimited' : 'Exceeds spend'}
              </Text>
            </View>
          ) : null}
        </View>
        <SimulationAssetSubtitle>
          Call {approval.callIndex + 1} · to {spenderLabel}
        </SimulationAssetSubtitle>
      </View>
      <View className="max-w-[40%] items-end">
        <Text
          className="font-mono-semibold text-data text-ink"
          numberOfLines={1}
        >
          {approval.unlimited
            ? 'Unlimited'
            : compactTokenAmount(approval.rawAmount, approval.token.decimals)}
        </Text>
        <Text
          className="mt-0.5 font-mono text-data text-ink-3"
          numberOfLines={1}
        >
          Spend{' '}
          {compactTokenAmount(
            approval.simulatedSpendRaw,
            approval.token.decimals,
          )}
        </Text>
      </View>
    </View>
  );
}

/**
 * The unified route review's asset row: every row names the call it belongs to
 * and the counterparty resolved from that call's contracts.
 */
function renderAssetRow(
  change: PrivySimulationAssetChange,
  index: number,
  contracts: readonly PrivySimulationContract[],
) {
  const outgoing = change.direction === 'out';

  return (
    <SimulationAssetAmountRow
      key={`${change.direction}-${change.callIndex}-${change.token.address ?? change.token.symbol}-${index}`}
      token={change.token}
      subtitle={
        <SimulationAssetSubtitle>
          Call {change.callIndex + 1} · {outgoing ? 'to' : 'from'}{' '}
          {resolveAssetCounterparty(change, contracts)}
        </SimulationAssetSubtitle>
      }
      direction={change.direction}
      rawAmount={change.rawAmount}
      amountMaxWidthClassName="max-w-[40%]"
    />
  );
}

function ApproveSection({
  approvals,
  contracts,
}: {
  approvals: readonly PrivySimulationApproval[];
  contracts: readonly PrivySimulationContract[];
}) {
  return (
    <View>
      <SimulationFlowSectionHeader label="You approve">
        <Icon icon={ShieldCheck} size="xs" tone="sign" />
      </SimulationFlowSectionHeader>
      {approvals.map((approval, index) => (
        <ApproveRow
          key={`approve-${approval.callIndex}-${approval.owner}-${approval.spender}-${approval.token.address ?? approval.token.symbol}-${index}`}
          approval={approval}
          contracts={contracts}
        />
      ))}
    </View>
  );
}

/**
 * The unified route-flow container: read-only approvals, outgoing transfers,
 * and incoming transfers rendered as one consistent row style. Every row
 * keeps its own callIndex so protocols, spenders, and counterparties from
 * different calls in the same bundle are never merged together.
 */
export function SimulationFlowRows({
  approvals,
  outgoing,
  incoming,
  contracts,
}: {
  approvals: readonly PrivySimulationApproval[];
  outgoing: readonly PrivySimulationAssetChange[];
  incoming: readonly PrivySimulationAssetChange[];
  contracts: readonly PrivySimulationContract[];
}) {
  return (
    <View className="overflow-hidden rounded-panel border border-rule bg-sheet">
      {approvals.length > 0 ? (
        <>
          <ApproveSection approvals={approvals} contracts={contracts} />
          <View className="mx-4 h-px bg-rule" />
        </>
      ) : null}
      <SimulationAssetFlowSections
        outgoing={outgoing}
        incoming={incoming}
        renderItem={(change, index) => renderAssetRow(change, index, contracts)}
      />
    </View>
  );
}
