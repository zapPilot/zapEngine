import Svg, { Circle, G, Line, Path } from 'react-native-svg';

interface ZapLogoProps {
  size?: number;
}

// Graduated gauge ticks (x1, y1, x2, y2) within the 0 0 64 64 viewBox.
const TICKS: readonly (readonly [number, number, number, number])[] = [
  [32, 8, 32, 12.5],
  [45.8, 12.3, 43.5, 15.6],
  [18.2, 12.3, 20.5, 15.6],
  [54.6, 23.8, 50.8, 25.2],
  [9.4, 23.8, 13.2, 25.2],
];

/** The Zap Pilot "Regime" dial mark (warm gold) — the 1c autopilot gauge. */
export function ZapLogo({ size = 16 }: ZapLogoProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <G stroke="#d4c5a3" strokeLinecap="round">
        <Path d="M16.5 49.5 A24 24 0 1 1 47.5 49.5" strokeWidth={3} />
        <G strokeWidth={1.4} strokeOpacity={0.4}>
          {TICKS.map(([x1, y1, x2, y2]) => (
            <Line key={`${x1}-${y1}`} x1={x1} y1={y1} x2={x2} y2={y2} />
          ))}
        </G>
        <Line x1={32} y1={32} x2={42.5} y2={13.8} strokeWidth={2.6} />
      </G>
      <Circle cx={32} cy={32} r={3} fill="#d4c5a3" />
    </Svg>
  );
}
