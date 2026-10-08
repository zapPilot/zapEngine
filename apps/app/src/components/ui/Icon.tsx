import { tokens } from '@zapengine/design-tokens/tokens';
import type { LucideIcon, LucideProps } from 'lucide-react-native';
import type { ReactElement } from 'react';
import { Platform } from 'react-native';

export interface IconProps {
  icon: LucideIcon;
  size?: keyof typeof tokens.size.icon;
  tone?:
    | 'default'
    | 'secondary'
    | 'muted'
    | 'inverse'
    | 'sign'
    | 'alert'
    | 'up'
    | 'down';
  accessibilityLabel?: string;
  style?: LucideProps['style'];
  className?: string;
}
export function Icon({
  icon: Glyph,
  size = 'md',
  tone = 'default',
  accessibilityLabel,
  ...props
}: IconProps): ReactElement {
  const colors = {
    default: tokens.mode.night.ink,
    secondary: tokens.mode.night['ink-2'],
    muted: tokens.mode.night['ink-3'],
    inverse: tokens.mode.night['on-sign'],
    sign: tokens.mode.night['sign-ink'],
    alert: tokens.mode.night.alert,
    up: tokens.mode.night.up,
    down: tokens.mode.night.down,
  };
  return (
    <Glyph
      {...props}
      size={tokens.size.icon[size]}
      color={colors[tone]}
      strokeWidth={size === 'xs' || size === 'sm' ? 2 : 1.75}
      {...(Platform.OS === 'web'
        ? {
            'aria-hidden': !accessibilityLabel,
            ...(accessibilityLabel
              ? { 'aria-label': accessibilityLabel, role: 'img' as const }
              : {}),
          }
        : {
            accessible: Boolean(accessibilityLabel),
            ...(accessibilityLabel ? { accessibilityLabel } : {}),
            accessibilityElementsHidden: !accessibilityLabel,
            importantForAccessibility: accessibilityLabel
              ? ('yes' as const)
              : ('no-hide-descendants' as const),
          })}
    />
  );
}
