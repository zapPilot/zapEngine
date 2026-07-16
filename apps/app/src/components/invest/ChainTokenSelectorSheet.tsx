import { Check, Search, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Modal, Pressable, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TokenIcon } from '@/components/token/TokenIcon';
import { Tap } from '@/components/ui/Tap';
import type { DesktopDepositToken } from '@/integration/depositTokens';
import {
  buildStrategyFundingOptions,
  type StrategyFundingOption,
} from '@/integration/investAmountModel';
import type { ChainTokenBalanceRow } from '@/integration/walletTokens';
import { formatUsd } from '@/lib/format';

interface ChainTokenSelectorSheetProps {
  visible: boolean;
  chainLabel: string;
  tokens: readonly DesktopDepositToken[];
  rows: readonly ChainTokenBalanceRow[];
  balanceState: 'loading' | 'unavailable' | 'loaded';
  selected: DesktopDepositToken;
  onSelect: (token: DesktopDepositToken) => void;
  onClose: () => void;
}

function balanceLabel(
  option: StrategyFundingOption,
  state: ChainTokenSelectorSheetProps['balanceState'],
): string {
  if (state === 'loading') return 'Loading…';
  if (state === 'unavailable') return 'Unavailable';
  const balance = Number.parseFloat(option.balance?.balance ?? '0');
  return `${balance.toLocaleString('en-US', {
    maximumFractionDigits: option.token.symbol === 'ETH' ? 6 : 2,
  })} ${option.token.symbol}`;
}

export function ChainTokenSelectorSheet({
  visible,
  chainLabel,
  tokens,
  rows,
  balanceState,
  selected,
  onSelect,
  onClose,
}: ChainTokenSelectorSheetProps) {
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');
  const options = useMemo(
    () => buildStrategyFundingOptions(tokens, rows, search),
    [rows, search, tokens],
  );
  const close = () => {
    setSearch('');
    onClose();
  };

  return (
    <Modal
      animationType="slide"
      transparent
      visible={visible}
      onRequestClose={close}
    >
      <View className="flex-1 justify-end bg-[rgba(0,0,0,.68)]">
        <Pressable
          accessibilityLabel="Close token selector"
          accessibilityRole="button"
          className="flex-1"
          onPress={close}
        />
        <View
          role="dialog"
          accessibilityViewIsModal
          className="rounded-t-[28px] border-t border-line bg-[#111113] px-5 pt-4"
          style={{
            minHeight: 390,
            paddingBottom: Math.max(insets.bottom, 24),
          }}
        >
          <View className="mx-auto mb-4 h-1 w-10 rounded-full bg-[#3f3f46]" />
          <View className="flex-row items-center justify-between">
            <View>
              <Text className="font-serif text-[24px] text-ink">
                Select token
              </Text>
              <Text className="mt-1 font-mono text-[10px] uppercase tracking-[.8px] text-accent">
                {chainLabel} funding source
              </Text>
            </View>
            <Tap
              accessibilityLabel="Close token selector"
              className="h-9 w-9 items-center justify-center rounded-full bg-[rgba(255,255,255,.05)]"
              onPress={close}
            >
              <X size={17} color="#a1a1aa" />
            </Tap>
          </View>

          <View className="mt-4 flex-row items-center gap-2 rounded-xl border border-line bg-[rgba(255,255,255,.035)] px-3">
            <Search size={16} color="#71717a" />
            <TextInput
              accessibilityLabel="Search funding tokens"
              className="h-11 flex-1 text-[14px] text-ink"
              placeholder="Search token"
              placeholderTextColor="#52525b"
              value={search}
              onChangeText={setSearch}
            />
          </View>

          <View className="mt-3 gap-2">
            {options.length === 0 ? (
              <View className="items-center px-4 py-8">
                <Text className="font-sans-semibold text-[13px] text-ink">
                  No tokens found
                </Text>
                <Text className="mt-1 text-[11px] text-ink-dim">
                  Try a symbol such as USDC or ETH.
                </Text>
              </View>
            ) : null}
            {options.map((option) => {
              const isSelected = option.token.symbol === selected.symbol;
              return (
                <Tap
                  key={`${option.token.chainId}:${option.token.symbol}`}
                  accessibilityLabel={`${option.token.symbol}, ${option.token.name}, ${balanceLabel(option, balanceState)}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  className="flex-row items-center gap-3 rounded-[15px] border border-line bg-[rgba(255,255,255,.025)] px-3 py-3"
                  onPress={() => {
                    onSelect(option.token);
                    close();
                  }}
                >
                  <TokenIcon
                    glyph={option.token.glyph}
                    bg={option.token.iconBg}
                    size={38}
                    alt=""
                  />
                  <View className="min-w-0 flex-1">
                    <View className="flex-row items-center gap-2">
                      <Text className="font-sans-semibold text-[14px] text-ink">
                        {option.token.symbol}
                      </Text>
                      <Text className="text-[11px] text-ink-dim">
                        {option.token.name}
                      </Text>
                    </View>
                    <Text className="mt-1 font-mono text-[9px] uppercase tracking-[.55px] text-accent">
                      {option.token.chainLabel}
                    </Text>
                  </View>
                  {isSelected ? <Check size={16} color="#d4c5a3" /> : null}
                  <View className="items-end pl-1">
                    <Text className="font-mono text-[12px] text-ink">
                      {balanceLabel(option, balanceState)}
                    </Text>
                    <Text className="mt-1 font-mono text-[10px] text-ink-dim">
                      {balanceState !== 'loaded'
                        ? '—'
                        : option.balance?.usdValue == null
                          ? option.balance === null
                            ? '$0.00'
                            : '—'
                          : formatUsd(option.balance.usdValue)}
                    </Text>
                  </View>
                </Tap>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}
