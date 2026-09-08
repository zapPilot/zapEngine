import { memo, useId, useMemo, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

interface SparklineProps {
  data: number[];
  height?: number;
  /** Unique gradient id when several sparklines share a page. */
  gradientId?: string;
}

/**
 * Portfolio-value sparkline (gold line + soft area fill), hand-rolled with
 * react-native-svg. The y-domain is pinned to [dataMin, dataMax] and the area
 * baseline to dataMin so the trend uses the full height — matching the POC's
 * minimal, axis-less look.
 */
export const Sparkline = memo(function Sparkline({
  data,
  height = 54,
  gradientId,
}: SparklineProps) {
  const autoId = `zp-spark-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const id = gradientId ?? autoId;
  const [width, setWidth] = useState(0);
  // Above the guard on purpose: a hook after an early return is a conditional
  // call. The short-series case is filtered out below instead.
  const { line, area } = useMemo(() => {
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    // 4px top margin (as on desktop) so the 2px stroke never clips.
    const top = 4;
    const points = data.map((value, index) => {
      const x = (index / (data.length - 1)) * width;
      const y = top + (1 - (value - min) / range) * (height - top);
      return `${x},${y}`;
    });
    const path = `M${points.join(' L')}`;
    return { line: path, area: `${path} L${width},${height} L0,${height} Z` };
  }, [data, height, width]);

  if (data.length < 2) {
    return null;
  }

  const onLayout = (event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
  };

  return (
    <View className="w-full" style={{ height }} onLayout={onLayout}>
      {width > 0 ? (
        <Svg width={width} height={height}>
          <Defs>
            <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#d4c5a3" stopOpacity={0.38} />
              <Stop offset="1" stopColor="#d4c5a3" stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Path d={area} fill={`url(#${id})`} />
          <Path
            d={line}
            fill="none"
            stroke="#d4c5a3"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      ) : null}
    </View>
  );
});
