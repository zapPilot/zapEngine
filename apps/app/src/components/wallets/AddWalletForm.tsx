import type { NewWallet } from '@zapengine/app-core/types';
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Tap } from '@/components/ui/Tap';

interface AddWalletFormProps {
  busy: boolean;
  onSubmit: (
    wallet: NewWallet,
  ) => Promise<{ success: boolean; error?: string }>;
  onDone: () => void;
  onCancel: () => void;
}

/**
 * Observe-only add: label + address, no ownership signature. Validation runs
 * inside useWalletMutations (validateNewWallet) — the returned error is the
 * single source of truth, so no client-side duplicate here.
 */
export function AddWalletForm({
  busy,
  onSubmit,
  onDone,
  onCancel,
}: AddWalletFormProps) {
  const [label, setLabel] = useState('');
  const [address, setAddress] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    const result = await onSubmit({
      address: address.trim(),
      label: label.trim(),
    });
    if (result.success) {
      setLabel('');
      setAddress('');
      onDone();
      return;
    }
    setError(result.error ?? 'Failed to add wallet');
  };

  return (
    <View className="gap-3">
      <TextInput
        className="rounded-2xl border border-line bg-[rgba(255,255,255,.035)] px-4 py-3 font-sans-semibold text-[13px] text-ink"
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="Wallet label"
        placeholderTextColor="#52525b"
        value={label}
        onChangeText={setLabel}
      />
      <TextInput
        className="rounded-2xl border border-line bg-[rgba(255,255,255,.035)] px-4 py-3 font-mono text-[13px] text-ink"
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="0x wallet address"
        placeholderTextColor="#52525b"
        value={address}
        onChangeText={setAddress}
      />
      {error ? (
        <Text className="text-[11.5px] leading-[16px] text-[#ef9292]">
          {error}
        </Text>
      ) : null}
      <View className="flex-row items-center gap-3">
        <View className="flex-1">
          <PrimaryButton disabled={busy} onPress={() => void submit()}>
            {busy ? 'Adding…' : 'Add wallet'}
          </PrimaryButton>
        </View>
        <Tap
          accessibilityRole="button"
          accessibilityLabel="Cancel adding wallet"
          className="min-h-9 justify-center px-3"
          onPress={onCancel}
        >
          <Text className="font-sans-semibold text-[12px] text-ink-dim">
            Cancel
          </Text>
        </Tap>
      </View>
    </View>
  );
}
