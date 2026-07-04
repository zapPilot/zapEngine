import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { ChainIconStack } from '@/components/token/ChainIconStack';
import { TokenIcon } from '@/components/token/TokenIcon';
import { Card } from '@/components/ui/Card';
import { InfoRow } from '@/components/ui/InfoRow';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { ScreenScrollView } from '@/components/ui/ScreenScrollView';
import { Tap } from '@/components/ui/Tap';
import { type ChainKey } from '@/data/demo';
import {
  buildSendTransactionRequest,
  defaultSendChain,
  holdingForChain,
  SEND_CHAIN_OPTIONS,
} from '@/integration/sendTransactions';
import { useAccount } from '@/integration/useAccount';
import { useWalletAssets } from '@/integration/walletTokens';
import { formatUsd } from '@/lib/format';

const SEND_FALLBACK_TOKEN = {
  glyph: '$',
  iconBg: '#2775ca',
  symbol: 'USDC',
} as const;

export function SendScreen() {
  const params = useLocalSearchParams<{ token?: string }>();
  const account = useAccount();
  const walletAssets = useWalletAssets(
    account.walletAddresses[0] ?? account.address,
  );
  const [amount, setAmount] = useState('');
  const [recipient, setRecipient] = useState('');
  const selectedAsset = useMemo(() => {
    const assets = account.isConnected ? walletAssets.assets : [];
    return (
      assets.find((asset) => asset.symbol === params.token) ?? assets[0] ?? null
    );
  }, [account.isConnected, params.token, walletAssets.assets]);
  const selectedChain = selectedAsset
    ? defaultSendChain(selectedAsset)
    : ('base' as ChainKey);
  const selectedHolding = holdingForChain(selectedAsset, selectedChain);

  const requestLabel = useMemo(() => {
    if (!selectedAsset || !selectedHolding) {
      return 'Select a live wallet token';
    }
    try {
      const request = buildSendTransactionRequest({
        amount,
        asset: selectedAsset,
        holding: selectedHolding,
        recipient,
      });
      return `Ready on chain ${request.chainId}`;
    } catch (error) {
      return error instanceof Error ? error.message : 'Enter send details';
    }
  }, [amount, recipient, selectedAsset, selectedHolding]);

  return (
    <ScreenScrollView>
      <ScreenHeader title="Send" />
      <View className="px-5 pt-5">
        <Card className="p-4">
          {selectedAsset ? (
            <View className="flex-row items-center gap-3">
              <TokenIcon
                glyph={selectedAsset.glyph}
                bg={selectedAsset.iconBg}
                alt={selectedAsset.symbol}
              />
              <View className="flex-1">
                <Text className="font-sans-semibold text-[15px] text-ink">
                  {selectedAsset.symbol}
                </Text>
                <Text className="mt-1 text-[12px] text-ink-dim">
                  {typeof selectedAsset.usdValue === 'number'
                    ? formatUsd(selectedAsset.usdValue)
                    : 'Live balance pending'}
                </Text>
              </View>
              <ChainIconStack chains={selectedAsset.chains} />
            </View>
          ) : (
            <View className="flex-row items-center gap-3">
              <TokenIcon
                glyph={SEND_FALLBACK_TOKEN.glyph}
                bg={SEND_FALLBACK_TOKEN.iconBg}
                alt={SEND_FALLBACK_TOKEN.symbol}
              />
              <Text className="font-sans-semibold text-[15px] text-ink">
                Connect wallet to send
              </Text>
            </View>
          )}
          <View className="mt-4 gap-3">
            <TextInput
              className="rounded-2xl border border-line bg-[rgba(255,255,255,.035)] px-4 py-3 font-mono text-[16px] text-ink"
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor="#52525b"
              value={amount}
              onChangeText={setAmount}
            />
            <TextInput
              className="rounded-2xl border border-line bg-[rgba(255,255,255,.035)] px-4 py-3 font-mono text-[13px] text-ink"
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="0x recipient"
              placeholderTextColor="#52525b"
              value={recipient}
              onChangeText={setRecipient}
            />
          </View>
          <View className="mt-4 flex-row gap-2">
            {SEND_CHAIN_OPTIONS.map((chain) => (
              <Tap
                key={chain.key}
                className="rounded-full border border-line px-3 py-2"
              >
                <Text className="font-mono text-[10px] text-ink-dim">
                  {chain.label}
                </Text>
              </Tap>
            ))}
          </View>
          <View className="mt-4">
            <InfoRow label="Status" value={requestLabel} />
          </View>
        </Card>
        <PrimaryButton className="mt-5" variant="secondary" disabled={true}>
          Review send
        </PrimaryButton>
      </View>
    </ScreenScrollView>
  );
}
