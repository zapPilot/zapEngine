import Svg, { Line } from 'react-native-svg';
import { tokens } from '@zapengine/design-tokens/tokens';
import { palette } from '@/lib/palette';
import type { StatusPrimitiveProps } from './StatusGlyph';
export function Rail({
  status = 'live',
  color = status === 'live' ? palette.ink : palette['rule-2'],
}: StatusPrimitiveProps) {
  return (
    <Svg width="100%" height={tokens.line.rail} accessible={false}>
      <Line
        x1={0}
        y1={tokens.line.rail / 2}
        x2={String(100) + '%'}
        y2={tokens.line.rail / 2}
        stroke={color}
        strokeWidth={tokens.line.rail}
        {...(tokens.status[status].line === 'dashed'
          ? { strokeDasharray: '6 4' }
          : {})}
      />
    </Svg>
  );
}
