import Svg, { Path } from 'react-native-svg';

/** Right-pointing arrow used as the trailing icon on primary CTAs. */
export function ArrowGlyph() {
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24">
      <Path
        d="M5 12h14"
        fill="none"
        stroke="#0a0a0a"
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M13 6l6 6-6 6"
        fill="none"
        stroke="#0a0a0a"
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
