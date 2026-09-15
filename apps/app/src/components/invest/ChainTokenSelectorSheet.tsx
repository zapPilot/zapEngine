import { Modal, Text, View } from 'react-native';
import { TokenIcon } from '@/components/token/TokenIcon';
import { Tap } from '@/components/ui/Tap';
import type { DepositTokenSymbol } from '@/integration/depositTokens';
import type { FundingSourceRow } from '@/integration/investFundingSources';
import { formatUsd6 } from '@/lib/format';
export function ChainTokenSelectorSheet({
  visible,
  title,
  subtitle,
  rows,
  onSelect,
  onClearPreference,
  onClose,
}: {
  visible: boolean;
  title: string;
  subtitle: string;
  rows: readonly FundingSourceRow[];
  onSelect: (symbol: DepositTokenSymbol) => void;
  onClearPreference: () => void;
  onClose: () => void;
}) {
  if (!visible) return null;
  return (
    <Modal transparent visible onRequestClose={onClose} animationType="slide">
      <View className="flex-1 justify-end bg-black/70">
        <View
          accessibilityViewIsModal
          className="rounded-t-[28px] border-t border-line bg-[#111113] p-5 pb-10"
        >
          <Text className="font-serif text-[24px] text-ink">{title}</Text>
          <Text className="my-2 text-[11px] text-ink-dim">{subtitle}</Text>
          <Tap
            accessibilityRole="button"
            accessibilityLabel="Automatic"
            accessibilityState={{ selected: rows.every((r) => !r.preferred) }}
            className="flex-row items-center gap-3 border-t border-line py-4"
            onPress={() => {
              onClearPreference();
              onClose();
            }}
          >
            <Text className="flex-1 text-ink">Automatic</Text>
            <Text className="font-mono text-[11px] text-ink-dim">
              Recommended
            </Text>
          </Tap>
          {rows
            .filter(
              (row) =>
                row.status !== 'unavailable' && (row.spendableUsd6 ?? 0n) > 0n,
            )
            .map((row) => (
              <Tap
                key={row.key}
                accessibilityRole="button"
                accessibilityLabel={row.label}
                accessibilityState={{ selected: row.preferred }}
                className="flex-row items-center gap-3 border-t border-line py-4"
                onPress={() => {
                  onSelect(row.symbol);
                  onClose();
                }}
              >
                <TokenIcon
                  symbol={row.symbol}
                  chainKey={row.chainKey}
                  size={32}
                  alt=""
                />
                <Text className="flex-1 text-ink">{row.label}</Text>
                <Text className="font-mono text-[11px] text-ink-dim">
                  Available {formatUsd6(row.spendableUsd6 ?? 0n)}
                </Text>
              </Tap>
            ))}
          <Tap
            accessibilityRole="button"
            accessibilityLabel="Close source selector"
            onPress={onClose}
          >
            <Text className="py-3 text-center text-accent">Close</Text>
          </Tap>
        </View>
      </View>
    </Modal>
  );
}
