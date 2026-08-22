import { useId, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

interface IndicatorLineChartProps {
  series: number[];
  overlay: (number | null)[];
  height?: number;
  gradientId?: string;
}

export function IndicatorLineChart({
  series,
  overlay,
  height = 120,
  gradientId,
}: IndicatorLineChartProps) {
  const autoId = `zp-indicator-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const id = gradientId ?? autoId;
  const [width, setWidth] = useState(0);
  if (series.length < 2) return null;

  const values = [
    ...series,
    ...overlay.filter((value): value is number => value !== null),
  ];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const point = (value: number, index: number, count: number) => {
    const x = (index / Math.max(1, count - 1)) * width;
    const y = 4 + (1 - (value - min) / range) * (height - 8);
    return `${x},${y}`;
  };
  const line = `M${series.map((value, index) => point(value, index, series.length)).join(' L')}`;
  const area = `${line} L${width},${height} L0,${height} Z`;
  const overlayPaths: string[] = [];
  let segment: string[] = [];
  overlay.forEach((value, index) => {
    if (value === null) {
      if (segment.length > 1) overlayPaths.push(`M${segment.join(' L')}`);
      segment = [];
    } else {
      segment.push(point(value, index, overlay.length));
    }
  });
  if (segment.length > 1) overlayPaths.push(`M${segment.join(' L')}`);

  const onLayout = (event: LayoutChangeEvent) =>
    setWidth(event.nativeEvent.layout.width);
  const chart =
    width === 0 ? null : (
      <Svg width={width} height={height}>
        <IndicatorGradient id={id} />
        <Path d={area} fill={`url(#${id})`} />
        <Path d={line} fill="none" stroke="#d4c5a3" strokeWidth={2} />
        {overlayPaths.map((path) => (
          <Path
            key={path}
            d={path}
            fill="none"
            stroke="#9a8f78"
            strokeWidth={1.5}
            strokeDasharray="5 4"
          />
        ))}
      </Svg>
    );
  return (
    <View className="w-full" style={{ height }} onLayout={onLayout}>
      {chart}
    </View>
  );
}

function IndicatorGradient({ id }: { id: string }) {
  return (
    <Defs>
      <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor="#d4c5a3" stopOpacity={0.3} />
        <Stop offset="1" stopColor="#d4c5a3" stopOpacity={0} />
      </LinearGradient>
    </Defs>
  );
}
