import { formatPct } from '@/lib/format';
import { View } from 'react-native';
import { AllocationBar } from '@/components/charts/AllocationBar';
import { Card } from './Card';
import { Text } from './Text';
export function AllocationSummary({
  items,
  emptyLabel,
}: {
  items: readonly { label: string; pct: number; color: string }[];
  emptyLabel: string;
}) {
  return (
    <Card padding="md">
      {items.length === 0 ? (
        <Text variant="body-sm" tone="muted">
          {emptyLabel}
        </Text>
      ) : (
        <>
          <AllocationBar
            segments={items.map((item) => ({
              color: item.color,
              value: item.pct,
            }))}
          />
          <View className="mt-3 gap-2">
            {items.map((item) => (
              <View
                key={item.label}
                className="min-h-hit flex-row items-center gap-2"
              >
                <View
                  className="h-2 w-2 rounded-pill"
                  style={{ backgroundColor: item.color }}
                  accessible={false}
                />
                <Text variant="body-sm" tone="secondary" className="flex-1">
                  {item.label}
                </Text>
                <Text variant="numeric-sm" numeric>
                  {formatPct(item.pct)}
                </Text>
              </View>
            ))}
          </View>
        </>
      )}
    </Card>
  );
}
