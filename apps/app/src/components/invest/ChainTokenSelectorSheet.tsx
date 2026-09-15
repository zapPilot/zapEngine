import { Modal, Text, View } from 'react-native';
import { TokenIcon } from '@/components/token/TokenIcon';
import { Tap } from '@/components/ui/Tap';
import type { DesktopDepositToken } from '@/integration/depositTokens';
import {
  fundingSourceLabel,
  sameDepositToken,
  type FundingOption,
} from '@/integration/investFundingPlanner';
import { formatUsd6 } from '@/lib/format';
export function ChainTokenSelectorSheet({
  visible,
  title,
  subtitle,
  options,
  selected,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  subtitle: string;
  options: readonly FundingOption[];
  selected: DesktopDepositToken | null;
  onSelect: (token: DesktopDepositToken) => void;
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
          {options
            .filter((o) => o.rejection === null)
            .map((o) => (
              <Tap
                key={`${o.candidate.token.chainId}:${o.candidate.token.symbol}`}
                accessibilityRole="button"
                accessibilityLabel={fundingSourceLabel(o.candidate.token)}
                accessibilityState={{
                  selected:
                    selected !== null &&
                    sameDepositToken(selected, o.candidate.token),
                }}
                className="flex-row items-center gap-3 border-t border-line py-4"
                onPress={() => {
                  onSelect(o.candidate.token);
                  onClose();
                }}
              >
                <TokenIcon
                  symbol={o.candidate.token.symbol}
                  chainKey={o.candidate.token.chainKey}
                  size={32}
                  alt=""
                />
                <Text className="flex-1 text-ink">
                  {fundingSourceLabel(o.candidate.token)}
                </Text>
                <Text className="font-mono text-[11px] text-ink-dim">
                  Available {formatUsd6(o.availableUsd6 ?? 0n)}
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
