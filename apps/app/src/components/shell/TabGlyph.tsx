import Svg, { Circle, Path } from 'react-native-svg';
import { tokens } from '@zapengine/design-tokens/tokens';
import type { AppTabName } from '@/integration/navigationModel';
import { palette } from '@/lib/palette';

const PATHS = {
  today: 'M12 3V6M21 12H18M12 21V18M3 12H6M12 12L16 8',
  listen: 'M4 14V12A8 8 0 0 1 20 12V14M4 12H7V20H4ZM17 12H20V20H17Z',
  runtime:
    'M12 2L22 7.5V17L12 22L2 17V7.5ZM2 7.5L12 13L22 7.5M12 13V22M7 5L17 10',
} as const;
const NO_FILL = 'none';

export function TabGlyph({
  name,
  active = false,
}: {
  name: AppTabName;
  active?: boolean;
}) {
  const color = active ? palette['sign-ink'] : palette['ink-3'];
  return (
    <Svg
      width={tokens.size.icon.lg}
      height={tokens.size.icon.lg}
      viewBox={[0, 0, 24, 24].join(' ')}
      accessible={false}
      fill={NO_FILL}
      stroke={color}
      strokeWidth={tokens.line.strong}
    >
      {name === 'today' ? (
        <>
          <Circle cx={12} cy={12} r={9} />
          <Circle cx={12} cy={12} r={4} />
          <Path d={PATHS.today} />
        </>
      ) : name === 'listen' ? (
        <Path d={PATHS.listen} />
      ) : (
        <Path d={PATHS.runtime} />
      )}
    </Svg>
  );
}
