import { tokens } from '@zapengine/design-tokens/tokens';
import type { ReactElement } from 'react';
import { ActivityIndicator } from 'react-native';

export function Spinner({
  size = 'sm',
  tone = 'accent',
  accessibilityLabel,
}: {
  size?: 'sm' | 'lg';
  tone?: 'accent' | 'inverse' | 'default';
  accessibilityLabel?: string;
}): ReactElement {
  return (
    <ActivityIndicator
      size={size === 'sm' ? 'small' : 'large'}
      color={
        tone === 'inverse'
          ? tokens.color['ink-inverse']
          : tone === 'default'
            ? tokens.color.ink
            : tokens.color.accent
      }
      accessibilityLabel={accessibilityLabel}
    />
  );
}
