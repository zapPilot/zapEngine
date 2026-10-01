import { tokens } from '@zapengine/design-tokens/tokens';
import type { ReactElement } from 'react';
import { View } from 'react-native';
import { Text } from './Text';
import { ZapLogo } from './ZapLogo';
const name = 'Zap Pilot';
export function BrandLockup({ heading }: { heading?: 1 } = {}): ReactElement {
  return (
    <View className="flex-row items-center gap-3">
      <ZapLogo size={tokens.size.icon.xl} />
      <Text variant="title-sm" {...(heading ? { heading } : {})}>
        {name}
      </Text>
    </View>
  );
}
