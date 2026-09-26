import { tokens } from '@zapengine/design-tokens/tokens';
import { useEffect, useState } from 'react';
import { Animated, Easing, View } from 'react-native';

import { useReducedMotion } from '@/components/ui/useReducedMotion';

interface PulseDotProps {
  color?: string;
  size?: number;
}

/** A solid dot with an expanding halo — the "agent is online" heartbeat. */
export function PulseDot({
  color = tokens.color.success,
  size = 8,
}: PulseDotProps) {
  const [pulse] = useState(() => new Animated.Value(0));
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) return;
    const heartbeat = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1400,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.delay(200),
      ]),
    );
    heartbeat.start();
    return () => heartbeat.stop();
  }, [pulse, reduceMotion]);

  const box = size * 2.5;
  return (
    <View
      className="items-center justify-center"
      style={{ width: box, height: box }}
      pointerEvents="none"
    >
      <Animated.View
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size,
          backgroundColor: color,
          opacity: pulse.interpolate({
            inputRange: [0, 1],
            outputRange: [0.6, 0],
          }),
          transform: [
            {
              scale: pulse.interpolate({
                inputRange: [0, 1],
                outputRange: [1, 2.5],
              }),
            },
          ],
        }}
      />
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size,
          backgroundColor: color,
          boxShadow: `0 0 ${size}px ${color}`,
        }}
      />
    </View>
  );
}
