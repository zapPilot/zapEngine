import type { NewWallet } from '@zapengine/app-core/types';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { TextField } from '@/components/ui/TextField';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';

import { Button } from '@/components/ui/Button';
import { Tap } from '@/components/ui/Tap';

interface AddWalletFormProps {
  busy: boolean;
  onSubmit: (
    wallet: NewWallet,
  ) => Promise<{ success: boolean; error?: string }>;
  onDone: () => void;
  onCancel: () => void;
}

/** Adds bundle membership first; ownership verification is separate. */
export function AddWalletForm({
  busy,
  onSubmit,
  onDone,
  onCancel,
}: AddWalletFormProps) {
  const { t } = useContentLanguage();
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
      <Text className="text-[11.5px] leading-[17px] text-ink-dim">
        Add any wallet now. It will stay unverified until you prove ownership
        from the wallet row.
      </Text>
      <TextField
        label={t('account.walletLabel')}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="Wallet label"
        value={label}
        onChangeText={setLabel}
      />
      <TextField
        label={t('account.walletAddress')}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="0x wallet address"
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
          <Button disabled={busy} onPress={() => void submit()}>
            {busy ? 'Adding wallet…' : 'Add wallet'}
          </Button>
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
