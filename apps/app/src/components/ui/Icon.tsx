import { tokens } from '@zapengine/design-tokens/tokens';
import type { LucideIcon } from 'lucide-react-native';
import type { ReactElement } from 'react';

export interface IconProps {
  icon: LucideIcon;
  size?: keyof typeof tokens.size.icon;
  tone?:
    | 'default'
    | 'secondary'
    | 'muted'
    | 'disabled'
    | 'inverse'
    | 'accent'
    | 'danger'
    | 'warning'
    | 'success';
  accessibilityLabel?: string;
}
export function Icon({
  icon: Glyph,
  size = 'md',
  tone = 'default',
  accessibilityLabel,
}: IconProps): ReactElement {
  const colors = {
    default: tokens.color.ink,
    secondary: tokens.color['ink-dim'],
    muted: tokens.color['ink-muted'],
    disabled: tokens.color['ink-faint'],
    inverse: tokens.color['ink-inverse'],
    accent: tokens.color.accent,
    danger: tokens.color.danger,
    warning: tokens.color.warning,
    success: tokens.color.success,
  };
  return (
    <Glyph
      size={tokens.size.icon[size]}
      color={colors[tone]}
      strokeWidth={size === 'xs' || size === 'sm' ? 2 : 1.75}
      accessible={Boolean(accessibilityLabel)}
      {...(accessibilityLabel ? { accessibilityLabel } : {})}
      accessibilityElementsHidden={!accessibilityLabel}
      importantForAccessibility={
        accessibilityLabel ? 'yes' : 'no-hide-descendants'
      }
    />
  );
}
