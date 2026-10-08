import { useId } from 'react';
import Svg, { Circle, ClipPath, Defs, Rect } from 'react-native-svg';
import { tokens } from '@zapengine/design-tokens/tokens';
import { palette } from '@/lib/palette';
export interface StatusPrimitiveProps {
  status?: keyof typeof tokens.status;
  color?: string;
}
export function StatusGlyph({
  status = 'live',
  color = palette.ink,
}: StatusPrimitiveProps) {
  const clip = useId();
  const clipReference = `url(#${clip})`;
  const glyph = tokens.status[status].glyph;
  return (
    <Svg
      width={tokens.size.icon.xs}
      height={tokens.size.icon.xs}
      viewBox={[0, 0, 12, 12].join(' ')}
      accessible={false}
    >
      <Defs>
        <ClipPath id={clip}>
          <Rect x={0} y={0} width={6} height={12} />
        </ClipPath>
      </Defs>
      <Circle
        cx={6}
        cy={6}
        r={5}
        stroke={color}
        strokeWidth={tokens.line.strong}
        fill={glyph === 'filled' ? color : 'none'}
        {...(glyph === 'dashed-ring' ? { strokeDasharray: '2 2' } : {})}
      />
      {glyph === 'half' ? (
        <Circle cx={6} cy={6} r={5} fill={color} clipPath={clipReference} />
      ) : null}
      {glyph === 'center-dot' ? (
        <Circle cx={6} cy={6} r={1.6} fill={color} />
      ) : null}
    </Svg>
  );
}
