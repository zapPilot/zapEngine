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
import { useState } from 'react';
import { Text, View } from 'react-native';

import { Tap } from '@/components/ui/Tap';
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

function CallRow({
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
      <Tap
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        className="flex-row items-center justify-between gap-3 px-4 py-3.5"
        onPress={() => setExpanded((value) => !value)}
      >
        <View className="min-w-0 flex-1">
          <Text className="font-sans-semibold text-[12px] text-ink">
            Call details
          </Text>
          <Text className="mt-0.5 text-[10px] text-ink-faint">
            {calls.length} {calls.length === 1 ? 'call' : 'calls'} executed in
            order
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
      {expanded ? (
        <View className="border-t border-line">
          {calls.map((call) => (
            <CallRow
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
