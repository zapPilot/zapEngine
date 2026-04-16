/**
 * Financial Metric Row Component
 *
 * Shared component for displaying financial metrics in tooltip UI.
 * Provides consistent styling for label-value pairs.
 */

interface FinancialMetricRowProps {
  /** Metric label (e.g., "Total Collateral", "Total Debt") */
  label: string;
  /** Formatted value to display */
  value: string;
  /** Optional custom class for the value */
  valueClassName?: string;
}

/**
 * Displays a single financial metric row with label and value
 *
 * @example
 * ```tsx
 * <FinancialMetricRow
 *   label="Total Collateral"
 *   value={`$${collateral.toLocaleString()}`}
 * />
 * ```
 */
export function FinancialMetricRow({
  label,
  value,
  valueClassName = "text-white font-medium",
}: FinancialMetricRowProps) {
  return (
    <div className="flex justify-between text-xs">
      <span className="text-gray-400">{label}</span>
      <span className={valueClassName}>{value}</span>
    </div>
  );
}
