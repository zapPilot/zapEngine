import { Children, type ReactNode } from 'react';
import { Text } from 'react-native';

export function wrapTextChildren(
  children: ReactNode,
  className: string,
): ReactNode {
  return Children.map(children, (child) =>
    typeof child === 'string' || typeof child === 'number' ? (
      <Text className={className}>{child}</Text>
    ) : (
      child
    ),
  );
}
