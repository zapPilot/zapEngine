import { Text, View } from 'react-native';
import { AllocationBar } from '@/components/charts/AllocationBar';
import { sectorColor } from '@/components/invest/sectorColors';
import {
  INVEST_SECTORS,
  sectorAllocationSummary,
  type SectorWeights,
} from '@/integration/investSectorModel';
import { bpsToPercentInput } from '@/integration/investTargetsModel';
export function SectorAllocationBar({ weights }: { weights: SectorWeights }) {
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Allocation: ${sectorAllocationSummary(weights)}`}
      className="my-3 gap-3"
    >
      <AllocationBar
        segments={INVEST_SECTORS.filter((s) => weights[s.id] > 0).map((s) => ({
          color: sectorColor(s),
          value: weights[s.id],
        }))}
      />
      <View className="flex-row flex-wrap gap-3">
        {INVEST_SECTORS.map((s) => (
          <View key={s.id} className="flex-row items-center gap-1.5">
            <View
              style={{
                width: 9,
                height: 9,
                borderRadius: 5,
                backgroundColor: sectorColor(s),
              }}
            />
            <Text className="text-[10px] text-ink-dim">{s.label}</Text>
            <Text className="font-mono text-[10px] text-ink">
              {bpsToPercentInput(weights[s.id])}%
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
