import { tokens } from '@zapengine/design-tokens/tokens';
import { useRouter } from 'expo-router';
import { ChevronLeft, X } from 'lucide-react-native';
import { Text, View } from 'react-native';

import { Tap } from '@/components/ui/Tap';

interface StepHeaderProps {
  title: string;
  step: string;
}

const circleStyle = {
  backgroundColor: 'rgba(255,255,255,.05)',
  borderWidth: 1,
  borderColor: 'rgba(255,255,255,.07)',
} as const;

/** Invest-flow top bar: back chevron, centered title + step label, close. */
export function StepHeader({ title, step }: StepHeaderProps) {
  const router = useRouter();

  return (
    <View className="flex-row items-center justify-between px-[18px] pt-2">
      <Tap
        onPress={() => router.back()}
        className="h-9 w-9 items-center justify-center rounded-full"
        style={circleStyle}
      >
        <ChevronLeft
          size={18}
          strokeWidth={2}
          color={tokens.color['ink-dim']}
        />
      </Tap>
      <View className="items-center">
        <Text className="font-sans-semibold text-[15px] text-ink">{title}</Text>
        <Text className="mt-[3px] font-mono text-[9px] uppercase tracking-[1.08px] text-ink-faint">
          {step}
        </Text>
      </View>
      <Tap
        onPress={() => router.push('/home')}
        className="h-9 w-9 items-center justify-center rounded-full"
        style={circleStyle}
      >
        <X size={15} strokeWidth={2} color={tokens.color['ink-dim']} />
      </Tap>
    </View>
  );
}
