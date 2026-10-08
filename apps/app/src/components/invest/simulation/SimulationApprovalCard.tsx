import { Icon } from '@/components/ui/Icon';
import { formatTokenBaseUnits } from '@zapengine/app-core/utils/formatting/tokenAmount';
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
  formatAddressOrUnknown,
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
  const spenderAddress = formatAddressOrUnknown(approval.spender);
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
    <View className="rounded-panel border border-sign/25 bg-sign-wash p-4">
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1">
          <View className="flex-row flex-wrap items-center gap-2">
            <Text className="font-text-semibold text-body-sm text-sign-ink">
              Approve {amountLabel} {approval.token.symbol}
            </Text>
            {approval.unlimited ? (
              <View className="rounded-round border border-alert bg-alert-wash px-2 py-0.5">
                <Text className="font-mono-semibold text-data uppercase tracking-[.5px] text-alert">
                  Unlimited
                </Text>
              </View>
            ) : null}
          </View>
          <Text className="font-mono-medium mt-1 text-label text-ink-3">
            Call {approval.callIndex + 1}
          </Text>
        </View>
        {!editing ? (
          <Tap
            accessibilityLabel={`Edit ${approval.token.symbol} approval amount`}
            accessibilityRole="button"
            className="flex-row items-center gap-1.5 rounded-panel px-2 py-1.5"
            disabled={isBusy}
            onPress={() => {
              setAmount(approval.amount);
              setEditing(true);
            }}
          >
            <Icon icon={Pencil} size="xs" tone="sign" />
            <Text className="font-text-semibold text-label text-sign-ink">
              Edit amount
            </Text>
          </Tap>
        ) : (
          <Tap
            accessibilityLabel="Cancel approval edit"
            accessibilityRole="button"
            className="h-8 w-8 items-center justify-center rounded-round"
            disabled={isBusy}
            onPress={() => {
              setAmount(approval.amount);
              setEditing(false);
            }}
          >
            <Icon icon={X} size="sm" tone="secondary" />
          </Tap>
        )}
      </View>

      {editing ? (
        <View className="mt-3 gap-2">
          <Text className="font-mono-semibold text-data uppercase tracking-[.6px] text-ink-3">
            Approval amount
          </Text>
          <View className="flex-row items-center gap-2">
            <TextInput
              accessibilityLabel="Approval amount"
              className="h-11 min-w-0 flex-1 rounded-panel border border-rule-2 bg-ground px-3 font-mono text-data text-ink"
              editable={!isBusy}
              inputMode="decimal"
              value={amount}
              onChangeText={setAmount}
              onSubmitEditing={() => void apply()}
            />
            <Tap
              accessibilityLabel="Apply approval amount and simulate again"
              accessibilityRole="button"
              className="h-11 items-center justify-center rounded-panel bg-sign px-3"
              disabled={isBusy || amount.trim() === ''}
              onPress={() => void apply()}
            >
              <Text className="font-text-semibold text-label text-ink-3">
                {isBusy ? 'Simulating…' : 'Apply & simulate'}
              </Text>
            </Tap>
          </View>
        </View>
      ) : null}

      <View className="mt-3 flex-row gap-4 border-t border-sign/15 pt-3">
        <View className="min-w-0 flex-1">
          <Text className="font-mono-semibold text-data uppercase tracking-[.6px] text-ink-3">
            Spender
          </Text>
          <Text
            className="mt-1 font-text-medium text-label text-ink"
            numberOfLines={1}
          >
            {spenderLabel}
          </Text>
          {hasVerifiedName ? (
            <Text className="mt-0.5 font-mono text-data text-ink-3">
              {spenderAddress}
            </Text>
          ) : null}
        </View>
        <View className="min-w-0 flex-1">
          <Text className="font-mono-semibold text-data uppercase tracking-[.6px] text-ink-3">
            Simulated spend
          </Text>
          <Text className="mt-1 font-mono text-data text-ink" numberOfLines={1}>
            {formatTokenBaseUnits(
              approval.simulatedSpendRaw,
              approval.token.decimals,
            )}{' '}
            {approval.token.symbol}
          </Text>
        </View>
      </View>

      {approval.exceedsSimulatedSpend ? (
        <View className="mt-3 flex-row items-start gap-2 rounded-panel border border-alert bg-alert-wash p-3">
          <Icon icon={AlertTriangle} size="xs" tone="alert" />
          <Text className="font-mono-medium min-w-0 flex-1 text-label leading-4 text-alert">
            Approval exceeds the amount spent in this simulation.
          </Text>
        </View>
      ) : null}
    </View>
  );
}
