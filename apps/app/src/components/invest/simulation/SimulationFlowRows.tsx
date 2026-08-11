import type {
  PrivySimulationApproval,
  PrivySimulationAssetChange,
  PrivySimulationContract,
} from '@zapengine/types/api';
import { ShieldCheck } from 'lucide-react-native';
import { Text, View } from 'react-native';

import {
  SimulationAssetAmountRow,
  SimulationDirectionalSection,
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
    <View className="flex-row items-center gap-3 border-t border-line px-4 py-3 first:border-t-0">
      <SimulationTokenMark token={approval.token} />
      <View className="min-w-0 flex-1">
        <View className="flex-row items-center gap-1.5">
          <Text
            className="font-sans-semibold text-[13px] text-ink"
            numberOfLines={1}
          >
            {approval.token.symbol}
          </Text>
          {risky ? (
            <View className="rounded-full border border-error/30 bg-error/10 px-1.5 py-0.5">
              <Text className="font-mono-semibold text-[7px] uppercase tracking-[.5px] text-error">
                {approval.unlimited ? 'Unlimited' : 'Exceeds spend'}
              </Text>
            </View>
          ) : null}
        </View>
        <Text className="mt-0.5 text-[10px] text-ink-faint" numberOfLines={1}>
          Call {approval.callIndex + 1} · to {spenderLabel}
        </Text>
      </View>
      <View className="max-w-[40%] items-end">
        <Text
          className="font-mono-semibold text-[13px] text-accent"
          numberOfLines={1}
        >
          {approval.unlimited
            ? 'Unlimited'
            : compactTokenAmount(approval.rawAmount, approval.token.decimals)}
        </Text>
        <Text
          className="mt-0.5 font-mono text-[9px] text-ink-faint"
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

// jscpd:ignore-start -- this wiring around the shared SimulationAssetAmountRow
// / SimulationDirectionalSection primitives is intentionally the same shape as
// SimulationAssetRows.tsx's AssetRow/FlowSide: that file is the legacy Privy
// preview's row (no counterparty, no call-index), while this is the unified
// route review's row (counterparty + call-index). Merging them would force
// one screen's content shape onto the other.
function AssetRow({
  change,
  contracts,
}: {
  change: PrivySimulationAssetChange;
  contracts: readonly PrivySimulationContract[];
}) {
  const outgoing = change.direction === 'out';
  const counterparty = resolveAssetCounterparty(change, contracts);

  return (
    <SimulationAssetAmountRow
      token={change.token}
      subtitle={
        <Text className="mt-0.5 text-[10px] text-ink-faint" numberOfLines={1}>
          Call {change.callIndex + 1} · {outgoing ? 'to' : 'from'}{' '}
          {counterparty}
        </Text>
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
        <ShieldCheck size={14} color="#d4c5a3" />
      </SimulationFlowSectionHeader>
      {approvals.map((approval) => (
        <ApproveRow
          key={`approve-${approval.callIndex}`}
          approval={approval}
          contracts={contracts}
        />
      ))}
    </View>
  );
}

function AssetSection({
  label,
  direction,
  changes,
  contracts,
}: {
  label: string;
  direction: 'out' | 'in';
  changes: readonly PrivySimulationAssetChange[];
  contracts: readonly PrivySimulationContract[];
}) {
  return (
    <SimulationDirectionalSection
      label={label}
      direction={direction}
      items={changes}
      renderItem={(change, index) => (
        <AssetRow
          key={`${direction}-${change.callIndex}-${change.token.address ?? change.token.symbol}-${index}`}
          change={change}
          contracts={contracts}
        />
      )}
    />
  );
}
// jscpd:ignore-end

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
    <View className="overflow-hidden rounded-2xl border border-line bg-surface">
      {approvals.length > 0 ? (
        <>
          <ApproveSection approvals={approvals} contracts={contracts} />
          <View className="mx-4 h-px bg-line" />
        </>
      ) : null}
      <AssetSection
        label="You send"
        direction="out"
        changes={outgoing}
        contracts={contracts}
      />
      <View className="mx-4 h-px bg-line" />
      <AssetSection
        label="You receive"
        direction="in"
        changes={incoming}
        contracts={contracts}
      />
    </View>
  );
}
