import { useState, type ReactElement } from 'react';
import { View } from 'react-native';
import { Disclosure } from './Disclosure';
import { Text } from './Text';
import { Button } from './Button';
export function TechnicalDetails({
  label,
  message,
  copyLabel,
  onCopy,
}: {
  label: string;
  message: string;
  copyLabel: string;
  onCopy: () => void;
}): ReactElement {
  const [expanded, setExpanded] = useState(false);
  return (
    <Disclosure
      expanded={expanded}
      onToggle={() => setExpanded((value) => !value)}
      accessibilityLabel={label}
      header={
        <Text variant="caption" tone="muted">
          {label}
        </Text>
      }
    >
      <View className="rounded-control border border-line bg-surface-high p-3">
        <Text variant="caption" tone="secondary" selectable>
          {message}
        </Text>
        <Button className="mt-3" variant="ghost" onPress={onCopy}>
          {copyLabel}
        </Button>
      </View>
    </Disclosure>
  );
}
