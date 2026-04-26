import type { ReactElement } from 'react';

export function LegendTitle({ title }: { title: string }): ReactElement {
  return (
    <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">
      {title}
    </div>
  );
}
