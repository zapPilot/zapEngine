import {
  type ChainBrandKey,
  TOKEN_BRAND,
  tokenBrandSymbolFor,
} from '@zapengine/brand-assets';
import { useState } from 'react';
import { Image, Text, View } from 'react-native';

import { CHAIN_ICON_SRC, TOKEN_ICON_SRC } from '@/data/assetIcons';

interface TokenIconProps {
  /** Any casing; resolved through the shared registry. */
  symbol: string;
  /** Renders the chain as a badge on the token, the standard compound mark. */
  chainKey?: ChainBrandKey;
  size?: number;
  /**
   * Logo from an indexer or simulation payload. Only used when the symbol has
   * no committed mark, since the committed one is higher resolution.
   */
  remoteLogoUrl?: string;
  alt?: string;
}

/**
 * Circular token mark with an optional chain badge. Resolution degrades in one
 * direction — committed mark, then remote logo, then the token's glyph, then its
 * initial — so an unknown or unreachable asset never renders as a broken image.
 */
export function TokenIcon({
  alt = '',
  symbol,
  chainKey,
  size = 38,
  remoteLogoUrl,
}: TokenIconProps) {
  const [failedLogoUrl, setFailedLogoUrl] = useState<string | null>(null);
  const brandSymbol = tokenBrandSymbolFor(symbol);
  const brand = brandSymbol ? TOKEN_BRAND[brandSymbol] : undefined;
  const committedSrc = brandSymbol ? TOKEN_ICON_SRC[brandSymbol] : undefined;
  const usableLogoUrl =
    !committedSrc && remoteLogoUrl && remoteLogoUrl !== failedLogoUrl
      ? remoteLogoUrl
      : undefined;
  const hasMark = Boolean(committedSrc ?? usableLogoUrl);
  const badgeSize = Math.round(size * 0.37);

  return (
    <View className="shrink-0" style={{ width: size, height: size }}>
      <View
        className="h-full w-full items-center justify-center overflow-hidden rounded-full"
        style={{
          // A mark carries its own color, so it sits on a neutral carrier;
          // only the glyph fallback uses the brand fill.
          backgroundColor: hasMark
            ? 'rgba(255,255,255,.06)'
            : (brand?.color ?? 'rgba(255,255,255,.06)'),
        }}
      >
        {committedSrc ? (
          <Image
            source={committedSrc}
            accessible={alt.length > 0}
            accessibilityLabel={alt || undefined}
            accessibilityIgnoresInvertColors
            style={{ width: size, height: size }}
          />
        ) : usableLogoUrl ? (
          <Image
            source={{ uri: usableLogoUrl }}
            accessible={alt.length > 0}
            accessibilityLabel={alt || undefined}
            accessibilityIgnoresInvertColors
            onError={() => setFailedLogoUrl(usableLogoUrl)}
            style={{ width: size, height: size }}
          />
        ) : (
          <Text
            className="font-sans-bold text-white"
            style={{ fontSize: size * 0.45 }}
          >
            {brand?.glyph ?? symbol.slice(0, 1).toUpperCase()}
          </Text>
        )}
      </View>
      {chainKey ? (
        // Never labelled: the row or control wrapping this icon already names
        // the chain, and a second announcement would just repeat it. The
        // #0a0a0a disc and ring knock the badge out of the token beneath it.
        <Image
          source={CHAIN_ICON_SRC[chainKey]}
          accessible={false}
          accessibilityIgnoresInvertColors
          className="absolute bottom-0 right-0 rounded-full border-[1.5px] border-[#0a0a0a] bg-[#0a0a0a]"
          style={{ width: badgeSize, height: badgeSize }}
        />
      ) : null}
    </View>
  );
}
