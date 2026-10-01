import { columnCountFor } from '@/lib/layout';
import { tokens } from '@zapengine/design-tokens/tokens';
import {
  Children,
  isValidElement,
  useContext,
  type ReactElement,
  type ReactNode,
} from 'react';
import { View } from 'react-native';
import { ContentWidthContext } from './contentWidthContext';
import { cn } from '@/lib/cn';

export function Columns({
  children,
  minColumnWidth = 320,
  className,
}: {
  children: ReactNode;
  minColumnWidth?: number;
  className?: string;
}): ReactElement {
  const contentWidth = useContext(ContentWidthContext);
  const gap = tokens.gutter.compact;
  const count = Math.max(
    1,
    Math.min(
      columnCountFor(contentWidth),
      Math.floor(
        ((contentWidth || tokens.container.narrow) + gap) /
          (minColumnWidth + gap),
      ),
    ),
  );
  const items = Children.toArray(children);
  return (
    <View
      className={cn('flex-row flex-wrap', className)}
      style={{ margin: -gap / 2 }}
    >
      {items.map((child, index) => (
        <View
          key={isValidElement(child) ? (child.key ?? index) : index}
          className={
            count === 1 ||
            (items.length % 2 === 1 && index === items.length - 1)
              ? 'w-full'
              : 'w-1/2'
          }
          style={{ padding: gap / 2 }}
        >
          {child}
        </View>
      ))}
    </View>
  );
}
