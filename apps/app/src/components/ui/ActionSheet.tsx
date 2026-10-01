import type { ReactNode } from 'react';
import { Sheet, type SheetProps } from './Sheet';
import { ListRow } from './ListRow';
export function ActionSheet({
  actions,
  children,
  ...props
}: Omit<SheetProps, 'children'> & {
  actions?: readonly {
    id: string;
    label: string;
    onPress: () => void;
    destructive?: boolean;
  }[];
  children?: ReactNode;
}) {
  return (
    <Sheet {...props}>
      {actions?.map((action) => (
        <ListRow
          key={action.id}
          title={action.label}
          accessibilityLabel={action.label}
          destructive={action.destructive ?? false}
          onPress={() => {
            props.onClose();
            action.onPress();
          }}
        />
      ))}
      {children}
    </Sheet>
  );
}
