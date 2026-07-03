import { View } from 'react-native';

import { cn } from '@/lib/cn';

interface StepProgressProps {
  current: number;
  total?: number;
}

/** Three-segment progress indicator for the invest flow. */
export function StepProgress({ current, total = 3 }: StepProgressProps) {
  return (
    <View className="flex-row gap-[5px] px-5 pt-[14px]">
      {Array.from({ length: total }, (_, index) => (
        <View
          key={index}
          className={cn(
            'h-[3px] flex-1 rounded-full',
            index < current ? 'bg-accent' : 'bg-[rgba(255,255,255,.1)]',
          )}
        />
      ))}
    </View>
  );
}
