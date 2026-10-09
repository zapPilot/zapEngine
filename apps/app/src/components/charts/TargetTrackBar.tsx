import { View } from 'react-native';
import { tokens } from '@zapengine/design-tokens/tokens';
export function TargetTrackBar({
  target,
  yours,
  color,
  accessibilityLabel,
}: {
  target: number | null;
  yours: number | null;
  color: string;
  accessibilityLabel: string;
}) {
  const targetWidth = target === null ? 0 : Math.max(0, Math.min(100, target));
  const yoursWidth = yours === null ? 0 : Math.max(0, Math.min(100, yours));
  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel}
      className="h-2 rounded-round bg-well"
    >
      <View
        className="absolute inset-y-0 left-0 rounded-round"
        style={{
          width: `${yoursWidth}%`,
          backgroundColor: color,
          opacity: 0.45,
        }}
      />
      {target !== null ? (
        <View
          className="absolute h-3 w-px"
          style={{
            left: `${targetWidth}%`,
            top: -tokens.line.strong,
            backgroundColor: tokens.mode.night.ink,
          }}
        />
      ) : null}
    </View>
  );
}
