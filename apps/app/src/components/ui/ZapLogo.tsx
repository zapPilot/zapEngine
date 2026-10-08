import { tokens } from '@zapengine/design-tokens/tokens';
import Svg, { Circle, Path } from 'react-native-svg';
import { palette } from '@/lib/palette';
export function ZapLogo({ size = 16 }: { size?: number }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox={tokens.mark.viewBox.join(' ')}
      fill="none"
    >
      {tokens.mark.layers.map((layer) =>
        layer.kind === 'path' ? (
          <Path
            key={layer.id}
            d={layer.d}
            stroke={palette[layer.role]}
            strokeWidth={layer.strokeWidth}
            strokeLinecap="round"
          />
        ) : (
          <Circle
            key={layer.id}
            cx={layer.cx}
            cy={layer.cy}
            r={layer.r}
            fill={palette[layer.role]}
          />
        ),
      )}
    </Svg>
  );
}
