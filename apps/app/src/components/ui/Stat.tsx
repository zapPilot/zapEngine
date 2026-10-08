import type { ReactElement } from 'react';
import type { MetricTone } from '@/integration/portfolioTypes';
import { View } from 'react-native';
import { Text } from './Text';
const tones = {
  neutral: 'default',
  positive: 'up',
  negative: 'down',
} as const;
export function Stat({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  tone?: MetricTone;
}): ReactElement {
  return (
    <View>
      <Text variant="label" tone="muted">
        {label}
      </Text>
      <Text variant="data-md" numeric tone={tones[tone]} className="mt-2">
        {value}
      </Text>
    </View>
  );
}
