import { useRef, useState } from 'react';
import {
  Text,
  View,
  type LayoutChangeEvent,
  type PointerEvent,
} from 'react-native';

import { Sparkline } from '@/components/charts/Sparkline';
import {
  calculateAdjacentSnapshotChange,
  type DailyValuePoint,
  nearestTrendPointIndex,
  snapshotCategoryTotals,
  trendPointX,
} from '@/integration/portfolioMetrics';
import { formatSignedUsd, formatUsd } from '@/lib/format';
import { formatSnapshotDate } from '@/lib/portfolioDates';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';

interface PortfolioTrendChartProps {
  trendPoints: readonly DailyValuePoint[];
  height?: number;
  gradientId?: string;
}

const TOOLTIP_WIDTH = 184;
const MARKER_RADIUS = 4;

export function PortfolioTrendChart({
  trendPoints,
  height = 158,
  gradientId,
}: PortfolioTrendChartProps) {
  const { languageCode, t } = useContentLanguage();
  const [width, setWidth] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const touchActiveRef = useRef(false);
  const values = trendPoints.flatMap((point) =>
    typeof point.total_value_usd === 'number' &&
    Number.isFinite(point.total_value_usd)
      ? [point.total_value_usd]
      : [],
  );

  if (values.length < 2) return null;

  const selectAt = (pointerX: number) => {
    setSelectedIndex(nearestTrendPointIndex(pointerX, width, values.length));
  };
  const onLayout = (event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
  };
  const onPointerDown = (event: PointerEvent) => {
    touchActiveRef.current = event.nativeEvent.pointerType !== 'mouse';
    if (touchActiveRef.current) event.preventDefault();
    selectAt(event.nativeEvent.offsetX);
  };
  const onPointerMove = (event: PointerEvent) => {
    if (event.nativeEvent.pointerType === 'mouse' || touchActiveRef.current) {
      if (touchActiveRef.current) event.preventDefault();
      selectAt(event.nativeEvent.offsetX);
    }
  };
  const closeTooltip = () => {
    touchActiveRef.current = false;
    setSelectedIndex(null);
  };

  const selectedPoint =
    selectedIndex === null ? undefined : trendPoints[selectedIndex];
  const selectedValue = selectedPoint?.total_value_usd;
  const markerCenter =
    selectedIndex === null
      ? 0
      : trendPointX(selectedIndex, width, values.length);
  const markerLeft = Math.max(
    0,
    Math.min(
      Math.max(0, width - MARKER_RADIUS * 2),
      markerCenter - MARKER_RADIUS,
    ),
  );
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const markerTop =
    typeof selectedValue === 'number'
      ? 4 + (1 - (selectedValue - min) / range) * (height - 4) - MARKER_RADIUS
      : 0;
  const tooltipLeft = Math.max(
    0,
    Math.min(
      Math.max(0, width - TOOLTIP_WIDTH),
      markerCenter - TOOLTIP_WIDTH / 2,
    ),
  );
  const change =
    selectedIndex === null
      ? null
      : calculateAdjacentSnapshotChange(trendPoints, selectedIndex);
  const categoryTotals = selectedPoint
    ? snapshotCategoryTotals(selectedPoint)
    : {};
  const dateLabel = formatSnapshotDate(selectedPoint?.date, languageCode);

  return (
    <View
      testID="portfolio-trend-chart"
      className="relative w-full"
      style={{ height }}
      onLayout={onLayout}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerLeave={closeTooltip}
      onPointerUp={closeTooltip}
      onPointerCancel={closeTooltip}
    >
      <Sparkline
        data={values}
        height={height}
        {...(gradientId === undefined ? {} : { gradientId })}
      />
      {selectedPoint && typeof selectedValue === 'number' ? (
        <View pointerEvents="none" className="absolute inset-0">
          <View
            testID="portfolio-trend-marker"
            className="absolute h-2 w-2 rounded-full border border-bg bg-accent"
            style={{ left: markerLeft, top: markerTop }}
          />
          <View
            testID="portfolio-trend-tooltip"
            className="absolute top-1 rounded-xl border border-line bg-[#151411]/[0.96] px-3 py-2"
            style={{ left: tooltipLeft, width: TOOLTIP_WIDTH }}
          >
            {dateLabel ? (
              <Text className="font-mono text-[9px] text-ink-faint">
                {t('portfolio.tooltip.date')}: {dateLabel}
              </Text>
            ) : null}
            <Text className="mt-0.5 font-mono text-[10px] text-ink">
              {t('portfolio.tooltip.netWorth')}: {formatUsd(selectedValue)}
            </Text>
            {change ? (
              <Text className="mt-0.5 font-mono text-[10px] text-ink-dim">
                {t('portfolio.tooltip.change')}: {formatSignedUsd(change.usd)}
              </Text>
            ) : null}
            {categoryTotals.assetsUsd === undefined ? null : (
              <Text className="mt-0.5 font-mono text-[10px] text-ink-dim">
                {t('portfolio.tooltip.assets')}:{' '}
                {formatUsd(categoryTotals.assetsUsd)}
              </Text>
            )}
            {categoryTotals.debtUsd === undefined ? null : (
              <Text className="mt-0.5 font-mono text-[10px] text-ink-dim">
                {t('portfolio.tooltip.debt')}:{' '}
                {formatUsd(categoryTotals.debtUsd)}
              </Text>
            )}
          </View>
        </View>
      ) : null}
    </View>
  );
}
