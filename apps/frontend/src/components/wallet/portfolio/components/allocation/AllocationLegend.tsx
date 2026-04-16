export interface AllocationLegendItem {
  symbol: string;
  percentage: number;
  color: string;
  label?: string; // Optional override for display name
}

interface AllocationLegendProps {
  items: AllocationLegendItem[];
  className?: string;
}

const STYLES = {
  legend: "flex gap-3 text-[10px] text-gray-400 mt-1",
  legendItem: "flex items-center gap-1",
  legendDot: "w-2 h-2 rounded-full",
} as const;

export function AllocationLegend({
  items,
  className = "",
}: AllocationLegendProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div
      className={`${STYLES.legend} ${className}`}
      data-testid="allocation-legend"
    >
      {items.map(item => (
        <div key={item.symbol} className={STYLES.legendItem}>
          <div
            className={STYLES.legendDot}
            style={{ backgroundColor: item.color }}
          />
          <span style={{ color: item.color }}>{item.label || item.symbol}</span>
          <span>{item.percentage.toFixed(0)}%</span>
        </div>
      ))}
    </div>
  );
}
