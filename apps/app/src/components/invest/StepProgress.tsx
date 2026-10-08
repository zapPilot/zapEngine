import { View } from 'react-native';

import { cn } from '@/lib/cn';

interface StepProgressProps {
  current: number;
  total?: number;
}

/** Two-segment progress indicator for the invest flow. */
export function StepProgress({ current, total = 2 }: StepProgressProps) {
  return (
    <View className="flex-row gap-[5px] pt-[14px]">
      {Array.from({ length: total }, (_, index) => (
        <View
          key={index}
          className={cn(
            'h-[3px] flex-1 rounded-round',
            index < current ? 'bg-ink' : 'bg-well',
          )}
        />
      ))}
    </View>
  );
}
