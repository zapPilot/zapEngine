import { createContext, useContext, type ReactElement } from 'react';
import {
  Text as NativeText,
  type TextProps as NativeTextProps,
} from 'react-native';
import { cn } from '@/lib/cn';
import { textVariants } from './textVariants';

const tones = {
  default: 'text-ink',
  secondary: 'text-ink-2',
  muted: 'text-ink-3',
  inverse: 'text-on-sign',
  sign: 'text-sign-ink',
  alert: 'text-alert',
  up: 'text-up',
  down: 'text-down',
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
  const display = ['display-xl', 'display', 'title'].includes(resolvedVariant);
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
