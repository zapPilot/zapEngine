import type { ReactElement } from 'react';

import { LegendTitle } from './LegendTitle';

export interface PillToggleItem<T> {
  key: T;
  label: string;
  color: string;
}

interface PillToggleGroupProps<T> {
  title: string;
  items: PillToggleItem<T>[];
  activeKeys: ReadonlySet<T>;
  onToggle: (key: T) => void;
  testIdPrefix?: string;
}

export function PillToggleGroup<T extends string>({
  title,
  items,
  activeKeys,
  onToggle,
  testIdPrefix,
}: PillToggleGroupProps<T>): ReactElement {
  return (
    <div className="min-w-[120px]">
      <LegendTitle title={title} />
      <div className="flex flex-wrap gap-1.5">
        {items.map(({ key, label, color }) => {
          const isActive = activeKeys.has(key);

          return (
            <button
              key={key}
              type="button"
              aria-pressed={isActive}
              data-testid={testIdPrefix ? `${testIdPrefix}${key}` : undefined}
              onClick={() => onToggle(key)}
              className={`rounded-full text-[10px] px-2 py-0.5 cursor-pointer transition-colors border ${
                isActive
                  ? 'text-gray-200'
                  : 'border-zinc-700 text-gray-500 bg-transparent'
              }`}
              style={
                isActive
                  ? {
                      borderColor: color,
                      backgroundColor: `${color}26`,
                    }
                  : undefined
              }
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
