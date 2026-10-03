import { columnCountFor, gridColumnCount } from '@/lib/layout';
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

export function Columns({
  children,
  minColumnWidth = 320,
  className,
  maxColumns,
}: {
  children: ReactNode;
  minColumnWidth?: number;
  className?: string;
  maxColumns?: 1 | 2 | 3 | 4;
}): ReactElement {
  const contentWidth = useContext(ContentWidthContext);
  const gap = tokens.gutter.compact;
  const items = Children.toArray(children);
  const count =
    maxColumns !== undefined
      ? gridColumnCount(contentWidth, minColumnWidth, items.length, maxColumns)
      : Math.max(
          1,
          Math.min(
            columnCountFor(contentWidth),
            Math.floor(
              ((contentWidth || tokens.container.narrow) + gap) /
                (minColumnWidth + gap),
            ),
          ),
        );
  const widths = ['w-full', 'w-1/2', 'w-1/3', 'w-1/4'];
  return (
    <View className={className ?? ''}>
      <View className="flex-row flex-wrap" style={{ margin: -gap / 2 }}>
        {items.map((child, index) => (
          <View
            key={isValidElement(child) ? (child.key ?? index) : index}
            className={
              count === 1 ||
              (maxColumns === undefined &&
                items.length % 2 === 1 &&
                index === items.length - 1)
                ? 'w-full'
                : (widths[count - 1] ?? 'w-full')
            }
            style={{ padding: gap / 2 }}
          >
            {child}
          </View>
        ))}
      </View>
    </View>
  );
}
