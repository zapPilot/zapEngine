import { View } from 'react-native';
import { tokens } from '@zapengine/design-tokens/tokens';
export function DistanceBar({
  distance,
  previous,
  accessibilityLabel,
}: {
  distance: number | null;
  previous: number | null;
  accessibilityLabel: string;
}) {
  const currentPosition =
    distance === null
      ? null
      : 50 + Math.max(-0.25, Math.min(0.25, distance)) * 200;
  const previousPosition =
    previous === null
      ? null
      : 50 + Math.max(-0.25, Math.min(0.25, previous)) * 200;
  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel}
      className="h-2 bg-well rounded-round"
    >
      <View
        className="absolute inset-y-0 w-px"
        style={{ left: '50%', backgroundColor: tokens.mode.night['rule-2'] }}
      />
      {previousPosition === null ? null : (
        <View
          className="absolute h-2 w-2 rounded-round border border-rule-2"
          style={{ left: `${previousPosition}%` }}
        />
      )}
      {currentPosition === null ? null : (
        <View
          className="absolute h-2 w-2 rounded-round bg-ink"
          style={{ left: `${currentPosition}%` }}
        />
      )}
    </View>
  );
}
