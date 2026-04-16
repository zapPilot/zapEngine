interface ProgressBarProps {
  percentage: number;
  label?: string;
  color: string; // Tailwind color class like "purple-500"
  showPercentage?: boolean;
  className?: string;
}

/**
 * ProgressBar - Displays a simple horizontal progress bar with optional label
 *
 * @example
 * <ProgressBar label="Target Spot" percentage={60} color="purple-500" />
 */
export function ProgressBar({
  percentage,
  label,
  color,
  showPercentage = true,
  className = "",
}: ProgressBarProps) {
  return (
    <div className={className}>
      {/* Label row */}
      <div className="flex justify-between items-center mb-2">
        {label && <span className="text-gray-300">{label}</span>}
        {showPercentage && (
          <span className="text-white font-bold">{percentage}%</span>
        )}
      </div>

      {/* Progress bar */}
      <div className="w-full bg-gray-700 h-2 rounded-full overflow-hidden">
        <div
          className={`bg-${color} h-full transition-all duration-300`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
