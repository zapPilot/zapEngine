import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Sheet, type SheetProps } from './Sheet';
import { Button } from './Button';
import { Text } from './Text';
export function ConfirmSheet({
  confirmLabel,
  cancelLabel,
  onConfirm,
  busy = false,
  destructive = false,
  body,
  children,
  ...props
}: Omit<SheetProps, 'children' | 'dismissible'> & {
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  busy?: boolean;
  destructive?: boolean;
  body: string;
  children?: ReactNode;
}) {
  return (
    <Sheet {...props} dismissible={!busy}>
      <Text variant="body" tone="secondary">
        {body}
      </Text>
      {children}
      <View className="mt-5 gap-2">
        <Button
          variant={destructive ? 'destructive' : 'primary'}
          accessibilityLabel={confirmLabel}
          onPress={onConfirm}
          loading={busy}
        >
          {confirmLabel}
        </Button>
        <Button
          variant="ghost"
          accessibilityLabel={cancelLabel}
          onPress={props.onClose}
          disabled={busy}
        >
          {cancelLabel}
        </Button>
      </View>
    </Sheet>
  );
}
