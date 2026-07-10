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
 * provide one (e.g. the generic WalletConnect entry).
 */
export function WalletBrandIcon({
  icon,
  size = 36,
  muted = false,
}: WalletBrandIconProps) {
  return (
    <View
      className={cn(
        'items-center justify-center overflow-hidden rounded-xl border',
        muted
          ? 'border-line bg-[rgba(255,255,255,.03)]'
          : 'border-line bg-[rgba(255,255,255,.04)]',
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
        <Wallet size={size * 0.5} strokeWidth={1.75} color="#d4c5a3" />
      )}
    </View>
  );
}
