import Svg, { Path } from 'react-native-svg';

interface TenderlyLogoProps {
  size?: number;
  color?: string;
}

/** A compact hexagon-and-checkmark mark for the bundled Tenderly verification row. */
export function TenderlyLogo({
  size = 16,
  color = '#d4c5a3',
}: TenderlyLogoProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 2 20 6.5V15.5L12 22 4 15.5V6.5Z"
        stroke={color}
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
      <Path
        d="M8.3 12.2 10.9 14.8 15.9 9.4"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
