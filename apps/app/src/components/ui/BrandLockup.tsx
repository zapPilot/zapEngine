import { tokens } from '@zapengine/design-tokens/tokens';
import glyphs from '@zapengine/design-tokens/brand/glyphs.json';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { ZapLogo } from './ZapLogo';
import { palette } from '@/lib/palette';
const glyphTransform = (glyph: { x: number; y: number }) =>
  `translate(${glyph.x} ${-glyph.y}) scale(1 -1)`;
export function BrandLockup({ heading }: { heading?: 1 } = {}) {
  const wordmark = glyphs.wordmark;
  const height = tokens.type.title.line;
  return (
    <View
      className="flex-row items-center gap-3"
      accessibilityRole={heading ? 'header' : undefined}
      accessibilityLabel={wordmark.text}
    >
      <ZapLogo size={tokens.size.icon.xl} />
      <Svg
        accessible={false}
        height={height}
        width={(height * wordmark.viewBox[2]!) / wordmark.viewBox[3]!}
        viewBox={wordmark.viewBox.join(' ')}
      >
        {wordmark.paths.map((glyph, i) => (
          <Path
            key={i}
            d={glyph.d}
            fill={palette.ink}
            transform={glyphTransform(glyph)}
          />
        ))}
      </Svg>
    </View>
  );
}
