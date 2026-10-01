import { createContext, useContext, type ReactElement } from 'react';
import {
  Text as NativeText,
  type TextProps as NativeTextProps,
} from 'react-native';
import { cn } from '@/lib/cn';
import { textVariants } from './textVariants';

const tones = {
  default: 'text-ink',
  secondary: 'text-ink-dim',
  muted: 'text-ink-muted',
  disabled: 'text-ink-faint',
  inverse: 'text-ink-inverse',
  accent: 'text-accent',
  danger: 'text-danger',
  warning: 'text-warning',
  success: 'text-success',
} as const;
type Variant = keyof typeof textVariants;
type Tone = keyof typeof tones;
const TextContext = createContext<{ variant: Variant; tone: Tone }>({
  variant: 'body',
  tone: 'default',
});
export interface TextProps extends NativeTextProps {
  variant?: Variant;
  tone?: Tone;
  numeric?: boolean;
  heading?: 1 | 2 | 3;
  className?: string;
}
export function Text({
  variant,
  tone,
  numeric = false,
  heading,
  className,
  style,
  children,
  ...props
}: TextProps): ReactElement {
  const inherited = useContext(TextContext);
  const resolvedVariant = variant ?? inherited.variant;
  const resolvedTone = tone ?? inherited.tone;
  const display = ['display', 'display-sm', 'title', 'title-sm'].includes(
    resolvedVariant,
  );
  return (
    <TextContext.Provider
      value={{ variant: resolvedVariant, tone: resolvedTone }}
    >
      <NativeText
        {...props}
        accessibilityRole={heading ? 'header' : props.accessibilityRole}
        aria-level={heading}
        maxFontSizeMultiplier={
          props.maxFontSizeMultiplier ?? (display ? 1.5 : 2)
        }
        className={cn(
          textVariants[resolvedVariant],
          tones[resolvedTone],
          className,
        )}
        style={[numeric ? { fontVariant: ['tabular-nums'] } : undefined, style]}
      >
        {children}
      </NativeText>
    </TextContext.Provider>
  );
}
