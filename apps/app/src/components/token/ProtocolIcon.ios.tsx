import { Text } from 'react-native';

import { ProtocolIconFrame } from '@/components/token/ProtocolIconFrame';

interface ProtocolIconProps {
  protocol: string;
  size?: number;
  labelled?: boolean;
}

export function ProtocolIcon({
  protocol,
  size = 26,
  labelled = false,
}: ProtocolIconProps) {
  const label = protocol.trim() || 'Contract';

  return (
    <ProtocolIconFrame label={label} size={size} labelled={labelled}>
      <Text
        className="font-sans-bold text-ink-dim"
        style={{ fontSize: size * 0.42 }}
      >
        {label.slice(0, 1).toUpperCase()}
      </Text>
    </ProtocolIconFrame>
  );
}
