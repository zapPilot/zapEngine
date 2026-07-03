import type { ImageSourcePropType } from 'react-native';
import { Image, Text, View } from 'react-native';

import { tokenIconSrcForSymbol } from '@/data/assetIcons';

const ICON_BY_BG: Record<string, ImageSourcePropType | undefined> = {
  '#2775ca': tokenIconSrcForSymbol('USDC'),
  '#26a17b': tokenIconSrcForSymbol('USDT'),
  '#2a2a30': tokenIconSrcForSymbol('ETH'),
  '#627eea': tokenIconSrcForSymbol('WETH'),
  '#f7931a': tokenIconSrcForSymbol('WBTC'),
  '#0052ff': tokenIconSrcForSymbol('CBBTC'),
};

interface TokenIconProps {
  glyph: string;
  bg: string;
  size?: number;
  src?: ImageSourcePropType;
  alt?: string;
}

/** Circular token icon with committed asset support and a glyph fallback. */
export function TokenIcon({
  alt = '',
  glyph,
  bg,
  size = 38,
  src,
}: TokenIconProps) {
  const iconSrc = src ?? ICON_BY_BG[bg.toLowerCase()];

  return (
    <View
      className="shrink-0 items-center justify-center overflow-hidden rounded-full"
      style={{
        width: size,
        height: size,
        backgroundColor: iconSrc ? 'rgba(255,255,255,.06)' : bg,
      }}
    >
      {iconSrc ? (
        <Image
          source={iconSrc}
          accessibilityLabel={alt}
          style={{ width: size, height: size }}
        />
      ) : (
        <Text
          className="font-sans-bold text-white"
          style={{ fontSize: size * 0.45 }}
        >
          {glyph}
        </Text>
      )}
    </View>
  );
}
