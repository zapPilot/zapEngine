import type { ReactElement } from 'react';
import { Tap, type TapProps } from './Tap';
import { Text } from './Text';
import { cn } from '@/lib/cn';
interface ChipProps extends Omit<TapProps, 'children'> {
  label: string;
  selected?: boolean;
  accessibilityLabel: string;
}
export function Chip({
  label,
  selected = false,
  className,
  ...props
}: ChipProps): ReactElement {
  return (
    <Tap
      {...props}
      accessibilityRole={props.accessibilityRole ?? 'button'}
      accessibilityState={{ ...props.accessibilityState, selected }}
      className={cn(
        'min-h-hit items-center justify-center rounded-pill px-3',
        selected ? 'bg-accent-soft' : 'bg-transparent',
        className,
      )}
    >
      <Text variant="label" tone={selected ? 'accent' : 'muted'}>
        {label}
      </Text>
    </Tap>
  );
}
