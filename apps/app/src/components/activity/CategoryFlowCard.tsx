import { ALLOCATION_CATEGORIES } from '@zapengine/app-core/lib/domain/allocationCategories';
import { Text, View } from 'react-native';

import { AllocationBar } from '@/components/charts/AllocationBar';
import { AllocationLegendRow } from '@/components/charts/AllocationLegendRow';
import { Card } from '@/components/ui/Card';
import { SectionLabel } from '@/components/ui/SectionLabel';
import type { ActivityCategoryFlow } from '@/data/demo';
import { cn } from '@/lib/cn';
import { formatSignedUsd } from '@/lib/format';

const CATEGORY_TOKEN_SYMBOL = {
  btc: 'BTC',
  eth: 'ETH',
  spy: 'SPY',
  stable: 'USDC',
  alt: 'ALT',
} as const;

/**
 * The robo-advisor lens on the feed: where money moved, by allocation
 * category. Categories with no activity in the window stay silent instead of
 * rendering empty rows.
 */
export function CategoryFlowCard({
  flows,
  label,
  className,
}: {
  flows: ActivityCategoryFlow[];
  label: string;
  className?: string;
}) {
  if (flows.length === 0) {
    return null;
  }

  return (
    <Card className={cn('p-4', className)}>
      <SectionLabel>{label}</SectionLabel>
      <AllocationBar
        className="mt-3"
        height={6}
        segments={flows.map((flow) => ({
          color: ALLOCATION_CATEGORIES[flow.category].color,
          value: flow.share,
        }))}
      />
      <View className="mt-[13px] gap-[9px]">
        {flows.map((flow) => (
          <AllocationLegendRow
            key={flow.category}
            symbol={CATEGORY_TOKEN_SYMBOL[flow.category]}
            color={ALLOCATION_CATEGORIES[flow.category].color}
            label={ALLOCATION_CATEGORIES[flow.category].label}
            value={
              <Text
                className={cn(
                  'font-mono text-[12.5px]',
                  flow.usdNet !== null && flow.usdNet >= 0
                    ? 'text-success'
                    : 'text-ink',
                )}
                numberOfLines={1}
              >
                {flow.usdNet !== null
                  ? formatSignedUsd(flow.usdNet)
                  : flow.label}
              </Text>
            }
          />
        ))}
      </View>
    </Card>
  );
}
