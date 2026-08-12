import { PROTOCOL_BRAND, protocolBrandKeyFor } from '@zapengine/brand-assets';
import { Image, Text, View } from 'react-native';

import { PROTOCOL_ICON_SRC } from '@/data/assetIcons';

interface ProtocolIconProps {
  /** Raw protocol identifier from a plan leg or copy; normalized internally. */
  protocol: string;
  size?: number;
  /** Pass the venue name only when no adjacent text already names it. */
  labelled?: boolean;
}

/**
 * Squircle venue mark. The shape is the point: a rounded square says "a place
 * you put money into", where a circle says "an asset you hold". Falls back to a
 * monogram, so an unrecognized protocol still reads as a venue.
 */
export function ProtocolIcon({
  protocol,
  size = 26,
  labelled = false,
}: ProtocolIconProps) {
  const brandKey = protocolBrandKeyFor(protocol);
  const label = brandKey ? PROTOCOL_BRAND[brandKey].label : protocol;
  const iconSrc = brandKey ? PROTOCOL_ICON_SRC[brandKey] : undefined;

  return (
    <View
      className="shrink-0 items-center justify-center overflow-hidden border border-line bg-[rgba(255,255,255,.04)]"
      // Proportional rather than a fixed `rounded-xl`: at the 18–26pt sizes
      // this renders at, a 12px radius rounds the square into a circle and the
      // asset-versus-venue shape distinction disappears.
      style={{ width: size, height: size, borderRadius: size * 0.28 }}
      {...(labelled
        ? { accessible: true, accessibilityLabel: label }
        : {
            accessibilityElementsHidden: true,
            importantForAccessibility: 'no-hide-descendants' as const,
          })}
    >
      {iconSrc ? (
        <Image
          source={iconSrc}
          accessibilityIgnoresInvertColors
          style={{ width: size * 0.72, height: size * 0.72 }}
        />
      ) : (
        <Text
          className="font-sans-bold text-ink-dim"
          style={{ fontSize: size * 0.42 }}
        >
          {label.slice(0, 1).toUpperCase()}
        </Text>
      )}
    </View>
  );
}
