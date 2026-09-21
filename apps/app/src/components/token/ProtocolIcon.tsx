import {
  PROTOCOL_BRAND,
  protocolBrandKeyFor,
} from '@zapengine/brand-assets/protocols';
import { Image, Text } from 'react-native';

import { PROTOCOL_ICON_SRC } from '@/data/protocolIcons';
import { ProtocolIconFrame } from '@/components/token/ProtocolIconFrame';

interface ProtocolIconProps {
  /** Raw protocol identifier from a plan leg or copy; normalized internally. */
  protocol: string;
  size?: number;
  /** Pass the venue name only when no adjacent text already names it. */
  labelled?: boolean;
}

/**
 * Squircle venue mark. Falls back to a monogram, so an unrecognized protocol
 * still reads as a venue.
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
    <ProtocolIconFrame label={label} size={size} labelled={labelled}>
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
    </ProtocolIconFrame>
  );
}
