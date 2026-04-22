import type { JSX } from 'react';

interface SimpleStatCardProps {
  label: string;
  value: string;
  valueClass: string;
  detail?: string;
}

/**
 * Compact stat card used in Market Dashboard grids.
 *
 * @param props - Card label, formatted value, Tailwind color class, and optional detail text
 * @returns Styled stat card element
 */
export function SimpleStatCard({
  label,
  value,
  valueClass,
  detail,
}: SimpleStatCardProps): JSX.Element {
  return (
    <div className="p-5 bg-gray-800/40 rounded-xl border border-gray-700/50 hover:bg-gray-800/60 transition-colors">
      <p className="text-sm font-medium text-gray-400 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${valueClass}`}>{value}</p>
      {detail ? <p className="mt-2 text-xs text-gray-500">{detail}</p> : null}
    </div>
  );
}
