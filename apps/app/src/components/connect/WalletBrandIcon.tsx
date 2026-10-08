import { Icon } from '@/components/ui/Icon';
import { Wallet } from 'lucide-react-native';
import { Image, View } from 'react-native';

import { cn } from '@/lib/cn';

interface WalletBrandIconProps {
  icon?: string;
  size?: number;
  muted?: boolean;
}

/**
 * Wallet logo for a connect-sheet row. Prefers the EIP-6963 icon data-URI the
 * connector announced; falls back to a neutral glyph when a wallet doesn't
 * provide one.
 */
export function WalletBrandIcon({
  icon,
  size = 36,
  muted = false,
}: WalletBrandIconProps) {
  return (
    <View
      className={cn(
        'items-center justify-center overflow-hidden rounded-panel border',
        muted ? 'border-rule bg-well' : 'border-rule bg-well',
      )}
      style={{ width: size, height: size }}
    >
      {icon ? (
        <Image
          source={{ uri: icon }}
          style={{ width: size, height: size }}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <Icon icon={Wallet} size="md" tone="sign" />
      )}
    </View>
  );
}
