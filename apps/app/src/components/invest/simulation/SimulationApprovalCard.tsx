import type {
  PrivySimulationApproval,
  PrivySimulationContract,
} from '@zapengine/types/api';
import { AlertTriangle, Pencil, X } from 'lucide-react-native';
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { Tap } from '@/components/ui/Tap';
import {
  compactTokenAmount,
  formatAddress,
  formatTokenAmount,
  resolveAddressTarget,
} from '@/integration/simulationPreviewModel';

interface SimulationApprovalCardProps {
  approval: PrivySimulationApproval;
  contracts: readonly PrivySimulationContract[];
  disabled: boolean;
  onUpdateApproval: (callIndex: number, amount: string) => Promise<void>;
}

export function SimulationApprovalCard({
  approval,
  contracts,
  disabled,
  onUpdateApproval,
}: SimulationApprovalCardProps) {
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(approval.amount);
  const [applying, setApplying] = useState(false);

  const spenderLabel = resolveAddressTarget(approval.spender, contracts);
  const spenderAddress = formatAddress(approval.spender);
  const hasVerifiedName = spenderLabel !== spenderAddress;
  const isBusy = disabled || applying;
  const amountLabel = approval.unlimited
    ? 'Unlimited'
    : compactTokenAmount(approval.rawAmount, approval.token.decimals);

  const apply = async () => {
    if (amount.trim() === '' || isBusy) return;
    setApplying(true);
    try {
      await onUpdateApproval(approval.callIndex, amount.trim());
      setEditing(false);
    } catch {
      setEditing(true);
    } finally {
      setApplying(false);
    }
  };

  return (
    <View className="rounded-2xl border border-accent/25 bg-accent-soft p-4">
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1">
          <View className="flex-row flex-wrap items-center gap-2">
            <Text className="font-sans-semibold text-[13px] text-accent">
              Approve {amountLabel} {approval.token.symbol}
            </Text>
            {approval.unlimited ? (
              <View className="rounded-full border border-error/30 bg-error/10 px-2 py-0.5">
                <Text className="font-mono-semibold text-[8px] uppercase tracking-[.5px] text-error">
                  Unlimited
                </Text>
              </View>
            ) : null}
          </View>
          <Text className="mt-1 text-[10px] text-ink-faint">
            Call {approval.callIndex + 1}
          </Text>
        </View>
        {!editing ? (
          <Tap
            accessibilityLabel={`Edit ${approval.token.symbol} approval amount`}
            accessibilityRole="button"
            className="flex-row items-center gap-1.5 rounded-lg px-2 py-1.5"
            disabled={isBusy}
            onPress={() => {
              setAmount(approval.amount);
              setEditing(true);
            }}
          >
            <Pencil size={13} color="#d4c5a3" />
            <Text className="font-sans-semibold text-[11px] text-accent">
              Edit amount
            </Text>
          </Tap>
        ) : (
          <Tap
            accessibilityLabel="Cancel approval edit"
            accessibilityRole="button"
            className="h-8 w-8 items-center justify-center rounded-full"
            disabled={isBusy}
            onPress={() => {
              setAmount(approval.amount);
              setEditing(false);
            }}
          >
            <X size={15} color="#a1a1aa" />
          </Tap>
        )}
      </View>

      {editing ? (
        <View className="mt-3 gap-2">
          <Text className="font-mono-semibold text-[9px] uppercase tracking-[.6px] text-ink-faint">
            Approval amount
          </Text>
          <View className="flex-row items-center gap-2">
            <TextInput
              accessibilityLabel="Approval amount"
              className="h-11 min-w-0 flex-1 rounded-xl border border-line-hi bg-bg px-3 font-mono text-[13px] text-ink"
              editable={!isBusy}
              inputMode="decimal"
              value={amount}
              onChangeText={setAmount}
              onSubmitEditing={() => void apply()}
            />
            <Tap
              accessibilityLabel="Apply approval amount and simulate again"
              accessibilityRole="button"
              className="h-11 items-center justify-center rounded-xl bg-accent px-3"
              disabled={isBusy || amount.trim() === ''}
              onPress={() => void apply()}
            >
              <Text className="font-sans-semibold text-[11px] text-[#221c0f]">
                {isBusy ? 'Simulating…' : 'Apply & simulate'}
              </Text>
            </Tap>
          </View>
        </View>
      ) : null}

      <View className="mt-3 flex-row gap-4 border-t border-accent/15 pt-3">
        <View className="min-w-0 flex-1">
          <Text className="font-mono-semibold text-[8px] uppercase tracking-[.6px] text-ink-faint">
            Spender
          </Text>
          <Text
            className="mt-1 font-sans-medium text-[11px] text-ink"
            numberOfLines={1}
          >
            {spenderLabel}
          </Text>
          {hasVerifiedName ? (
            <Text className="mt-0.5 font-mono text-[9px] text-ink-faint">
              {spenderAddress}
            </Text>
          ) : null}
        </View>
        <View className="min-w-0 flex-1">
          <Text className="font-mono-semibold text-[8px] uppercase tracking-[.6px] text-ink-faint">
            Simulated spend
          </Text>
          <Text
            className="mt-1 font-mono text-[11px] text-ink"
            numberOfLines={1}
          >
            {formatTokenAmount(
              approval.simulatedSpendRaw,
              approval.token.decimals,
            )}{' '}
            {approval.token.symbol}
          </Text>
        </View>
      </View>

      {approval.exceedsSimulatedSpend ? (
        <View className="mt-3 flex-row items-start gap-2 rounded-xl border border-error/25 bg-error/10 p-3">
          <AlertTriangle size={14} color="#ff6f61" />
          <Text className="min-w-0 flex-1 text-[10.5px] leading-4 text-error">
            Approval exceeds the amount spent in this simulation.
          </Text>
        </View>
      ) : null}
    </View>
  );
}
