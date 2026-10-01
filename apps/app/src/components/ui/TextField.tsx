import { tokens } from '@zapengine/design-tokens/tokens';
import { useId, type ReactNode } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';
import { Text } from './Text';
import { cn } from '@/lib/cn';
interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  helper?: string;
  error?: string;
  prefix?: ReactNode;
  suffix?: ReactNode;
  numeric?: boolean;
}
export function TextField({
  label,
  helper,
  error,
  prefix,
  suffix,
  numeric = false,
  className,
  ...props
}: TextFieldProps) {
  const id = useId();
  return (
    <View className={cn('gap-2', className)}>
      <Text variant="label">{label}</Text>
      <View
        className={cn(
          'min-h-hit flex-row items-center gap-2 rounded-control border bg-surface-high px-3',
          error ? 'border-danger-line' : 'border-line-hi',
        )}
      >
        {prefix}
        <TextInput
          {...props}
          accessibilityLabel={props.accessibilityLabel ?? label}
          aria-describedby={error || helper ? id : undefined}
          aria-invalid={Boolean(error)}
          keyboardType={
            props.keyboardType ?? (numeric ? 'decimal-pad' : 'default')
          }
          placeholderTextColor={tokens.color['ink-muted']}
          className={cn(
            'min-h-hit min-w-0 flex-1 text-body text-ink',
            numeric ? 'font-mono' : 'font-sans',
          )}
        />
        {suffix}
      </View>
      {error ? (
        <Text
          nativeID={id}
          variant="caption"
          tone="danger"
          accessibilityRole="alert"
        >
          {error}
        </Text>
      ) : helper ? (
        <Text nativeID={id} variant="caption" tone="muted">
          {helper}
        </Text>
      ) : null}
    </View>
  );
}
