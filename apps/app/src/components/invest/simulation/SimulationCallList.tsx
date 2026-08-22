import type {
  PrivySimulationApproval,
  PrivySimulationCall,
  PrivySimulationContract,
} from '@zapengine/types/api';
import {
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  XCircle,
} from 'lucide-react-native';
import { type ReactNode, useState } from 'react';
import { Text, View } from 'react-native';

import { Tap } from '@/components/ui/Tap';
import { TokenIcon } from '@/components/token/TokenIcon';
import {
  approvalForCall,
  compactTokenAmount,
  formatInteger,
  resolveCallTarget,
  titleCase,
} from '@/integration/simulationPreviewModel';

function StatusIcon({ status }: { status: PrivySimulationCall['status'] }) {
  if (status === 'succeeded') {
    return <CheckCircle2 size={17} color="#7ad88f" />;
  }
  if (status === 'failed') {
    return <XCircle size={17} color="#ff6f61" />;
  }
  return <CircleDashed size={17} color="#71717a" />;
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
    <View className="border-t border-line px-4 py-3 first:border-t-0">
      <View className="flex-row items-start gap-3">
        <View className="pt-0.5">
          <StatusIcon status={call.status} />
        </View>
        <View className="min-w-0 flex-1">
          <View className="flex-row items-start justify-between gap-2">
            <View className="min-w-0 flex-1">
              <Text
                className="font-sans-semibold text-[12px] text-ink"
                numberOfLines={1}
              >
                {titleCase(call.method)}
              </Text>
              <Text className="mt-0.5 text-[10px] text-ink-dim">
                to {resolveCallTarget(call, contracts)}
              </Text>
            </View>
            <Text className="font-mono text-[9px] uppercase text-ink-faint">
              {titleCase(call.status)}
            </Text>
          </View>

          <View className="mt-2 flex-row flex-wrap items-center gap-x-4 gap-y-1">
            <Text className="font-mono text-[9.5px] text-ink-faint">
              Gas {formatInteger(call.gasUsed)}
            </Text>
            {approval ? (
              <View className="flex-row items-center gap-1.5">
                <TokenIcon
                  symbol={approval.token.symbol}
                  size={16}
                  {...(approval.token.logoUrl
                    ? { remoteLogoUrl: approval.token.logoUrl }
                    : {})}
                />
                <Text className="font-mono text-[9.5px] text-accent">
                  Approval{' '}
                  {approval.unlimited
                    ? 'Unlimited'
                    : compactTokenAmount(
                        approval.rawAmount,
                        approval.token.decimals,
                      )}{' '}
                  {approval.token.symbol}
                </Text>
              </View>
            ) : null}
          </View>

          {call.error ? (
            <View
              accessibilityRole="alert"
              className="mt-2 rounded-xl border border-error/25 bg-error/10 p-2.5"
            >
              <Text className="text-[10px] leading-4 text-error">
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
    <Tap
      accessibilityLabel={expanded ? expandedLabel : collapsedLabel}
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      className="flex-row items-center gap-3 px-4 py-3.5"
      onPress={onToggle}
    >
      {icon}
      <View className="min-w-0 flex-1">
        <Text
          className="font-sans-semibold text-[12px] text-ink"
          numberOfLines={1}
        >
          {title}
        </Text>
        <Text className="mt-0.5 text-[10px] text-ink-faint" numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      <ChevronDown
        size={17}
        color="#a1a1aa"
        style={{
          transform: [{ rotate: expanded ? '180deg' : '0deg' }],
        }}
      />
    </Tap>
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
    <View className="overflow-hidden rounded-2xl border border-line bg-surface">
      <SimulationCollapseToggle
        expanded={expanded}
        onToggle={() => setExpanded((value) => !value)}
        expandedLabel="Hide transaction call details"
        collapsedLabel="Show transaction call details"
        title="Call details"
        subtitle={`${calls.length} ${calls.length === 1 ? 'call' : 'calls'} executed in order`}
      />
      {expanded ? (
        <View className="border-t border-line">
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
