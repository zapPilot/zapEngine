import { Icon } from '@/components/ui/Icon';
import type {
  PrivySimulationApproval,
  PrivySimulationCall,
  PrivySimulationContract,
} from '@zapengine/types/api';
import { CheckCircle2, CircleDashed, XCircle } from 'lucide-react-native';
import { type ReactNode, useState } from 'react';
import { Text, View } from 'react-native';

import { Disclosure } from '@/components/ui/Disclosure';
import {
  approvalForCall,
  compactTokenAmount,
  formatInteger,
  resolveCallTarget,
  titleCase,
} from '@/integration/simulationPreviewModel';

function StatusIcon({ status }: { status: PrivySimulationCall['status'] }) {
  if (status === 'succeeded') {
    return <Icon icon={CheckCircle2} size="md" tone="default" />;
  }
  if (status === 'failed') {
    return <Icon icon={XCircle} size="md" tone="alert" />;
  }
  return <Icon icon={CircleDashed} size="md" tone="default" />;
}

/** Shared with SimulationTenderlyEvidence, which owns its own outer toggle. */
export function SimulationCallRow({
  call,
  contracts,
  approvals,
}: {
  call: PrivySimulationCall;
  contracts: readonly PrivySimulationContract[];
  approvals: readonly PrivySimulationApproval[];
}) {
  const approval = approvalForCall(call, approvals);

  return (
    <View className="border-t border-rule px-4 py-3 first:border-t-0">
      <View className="flex-row items-start gap-3">
        <View className="pt-0.5">
          <StatusIcon status={call.status} />
        </View>
        <View className="min-w-0 flex-1">
          <View className="flex-row items-start justify-between gap-2">
            <View className="min-w-0 flex-1">
              <Text
                className="font-text-semibold text-caption text-ink"
                numberOfLines={1}
              >
                {titleCase(call.method)}
              </Text>
              <Text className="font-mono-medium mt-0.5 text-label text-ink-2">
                to {resolveCallTarget(call, contracts)}
              </Text>
            </View>
            <Text className="font-mono text-data uppercase text-ink-3">
              {titleCase(call.status)}
            </Text>
          </View>

          <View className="mt-2 flex-row flex-wrap items-center gap-x-4 gap-y-1">
            <Text className="font-mono text-data text-ink-3">
              Gas {formatInteger(call.gasUsed)}
            </Text>
            {approval ? (
              <Text className="font-mono text-data text-ink">
                Approval{' '}
                {approval.unlimited
                  ? 'Unlimited'
                  : compactTokenAmount(
                      approval.rawAmount,
                      approval.token.decimals,
                    )}{' '}
                {approval.token.symbol}
              </Text>
            ) : null}
          </View>

          {call.error ? (
            <View
              accessibilityRole="alert"
              className="mt-2 rounded-panel border border-alert bg-alert-wash p-2.5"
            >
              <Text className="font-mono-medium text-label leading-4 text-alert">
                {call.error}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

/** Shared with SimulationTenderlyEvidence, which owns its own expand state. */
export function SimulationCollapseToggle({
  expanded,
  onToggle,
  expandedLabel,
  collapsedLabel,
  title,
  subtitle,
  icon,
}: {
  expanded: boolean;
  onToggle: () => void;
  expandedLabel: string;
  collapsedLabel: string;
  title: string;
  subtitle: string;
  icon?: ReactNode;
}) {
  return (
    <Disclosure
      expanded={expanded}
      onToggle={onToggle}
      accessibilityLabel={expanded ? expandedLabel : collapsedLabel}
      className="flex-row items-center gap-3 px-4 py-3.5"
      header={
        <>
          {icon}
          <View className="min-w-0 flex-1">
            <Text
              className="font-text-semibold text-caption text-ink"
              numberOfLines={1}
            >
              {title}
            </Text>
            <Text
              className="font-mono-medium mt-0.5 text-label text-ink-3"
              numberOfLines={1}
            >
              {subtitle}
            </Text>
          </View>
        </>
      }
    />
  );
}

export function SimulationCallList({
  calls,
  contracts,
  approvals,
}: {
  calls: readonly PrivySimulationCall[];
  contracts: readonly PrivySimulationContract[];
  approvals: readonly PrivySimulationApproval[];
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <View className="overflow-hidden rounded-panel border border-rule bg-sheet">
      <SimulationCollapseToggle
        expanded={expanded}
        onToggle={() => setExpanded((value) => !value)}
        expandedLabel="Hide transaction call details"
        collapsedLabel="Show transaction call details"
        title="Call details"
        subtitle={`${calls.length} ${calls.length === 1 ? 'call' : 'calls'} executed in order`}
      />
      {expanded ? (
        <View className="border-t border-rule">
          {calls.map((call) => (
            <SimulationCallRow
              key={call.index}
              call={call}
              contracts={contracts}
              approvals={approvals}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}
