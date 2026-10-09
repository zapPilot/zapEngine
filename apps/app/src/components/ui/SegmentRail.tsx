import { View } from 'react-native';
import { tokens } from '@zapengine/design-tokens/tokens';
import type { CapabilityStatus } from '@zapengine/zap-pilot-story/status';
export function SegmentRail({
  statuses,
  accessibilityLabel,
}: {
  statuses: readonly CapabilityStatus[];
  accessibilityLabel: string;
}) {
  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel}
      className="flex-row gap-1"
    >
      {statuses.map((status, index) => (
        <View
          key={index}
          className="flex-1"
          style={{
            borderTopWidth: tokens.line.rail,
            borderTopColor:
              status === 'live'
                ? tokens.mode.night.ink
                : tokens.mode.night['ink-3'],
            borderStyle:
              tokens.status[status].line === 'dashed' ? 'dashed' : 'solid',
            opacity: status === 'planned' ? 0.5 : 1,
          }}
        />
      ))}
    </View>
  );
}
