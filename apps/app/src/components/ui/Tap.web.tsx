import type { ReactElement } from 'react';
import { Pressable } from 'react-native';
import { cn } from '@/lib/cn';
import type { TapProps } from './Tap.types';
export type { TapProps } from './Tap.types';
const feedbackClasses = {
  scale:
    'web:transition-transform web:duration-fast web:active:scale-press web:motion-reduce:transform-none',
  highlight:
    'web:transition-colors web:duration-fast web:hover:bg-accent-subtle web:active:bg-accent-soft',
  opacity:
    'web:transition-opacity web:duration-fast web:hover:opacity-90 web:active:opacity-75',
  none: '',
};
export function Tap({
  className,
  feedback = 'scale',
  disabled,
  ...props
}: TapProps): ReactElement {
  return (
    <Pressable
      {...props}
      disabled={disabled}
      className={cn(disabled ? '' : feedbackClasses[feedback], className)}
    />
  );
}
