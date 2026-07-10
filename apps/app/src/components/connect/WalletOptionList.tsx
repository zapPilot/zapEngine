import type { WalletConnectorOption } from '@zapengine/app-core/types';
import { View } from 'react-native';

import { WalletOptionRow } from '@/components/connect/WalletOptionRow';

interface WalletOptionListProps {
  options: WalletConnectorOption[];
  connectingId: string | null;
  isBusy: boolean;
  onWalletPress: (option: WalletConnectorOption) => void;
}

/** Renders one wallet-option group (Recommended or Other) as connect rows. */
export function WalletOptionList({
  options,
  connectingId,
  isBusy,
  onWalletPress,
}: WalletOptionListProps) {
  return (
    <View className="mt-1">
      {options.map((option, index) => (
        <WalletOptionRow
          key={option.id}
          option={option}
          isConnecting={connectingId === option.id}
          disabled={isBusy && connectingId !== option.id}
          showBorder={index < options.length - 1}
          onPress={() => onWalletPress(option)}
        />
      ))}
    </View>
  );
}
