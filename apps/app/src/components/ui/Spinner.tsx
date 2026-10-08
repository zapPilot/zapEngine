import { tokens } from '@zapengine/design-tokens/tokens';
import type { ReactElement } from 'react';
import { ActivityIndicator } from 'react-native';

export function Spinner({
  size = 'sm',
  tone = 'default',
  accessibilityLabel,
}: {
  size?: 'sm' | 'lg';
  tone?: 'sign' | 'inverse' | 'default';
  accessibilityLabel?: string;
}): ReactElement {
  return (
    <ActivityIndicator
      size={size === 'sm' ? 'small' : 'large'}
      color={
        tone === 'inverse'
          ? tokens.mode.night['on-sign']
          : tone === 'default'
            ? tokens.mode.night.ink
            : tokens.mode.night['sign-ink']
      }
      accessibilityLabel={accessibilityLabel}
    />
  );
}
