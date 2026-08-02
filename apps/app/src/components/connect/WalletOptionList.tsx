import type { WalletConnectorOption } from '@zapengine/app-core/types';
import { View } from 'react-native';

import { WalletOptionRow } from '@/components/connect/WalletOptionRow';

interface WalletOptionListProps {
  options: WalletConnectorOption[];
  connectingId: string | null;
  isBusy: boolean;
  onWalletPress: (option: WalletConnectorOption) => void;
}

/** Renders the approved wallet options as connect rows. */
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
          disabled={isBusy}
          showBorder={index < options.length - 1}
          onPress={() => onWalletPress(option)}
        />
      ))}
    </View>
  );
}
