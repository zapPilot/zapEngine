import type { LucideIcon } from 'lucide-react';

import { BaseCard } from './BaseCard';

interface EmptyStateCardProps {
  icon: LucideIcon;
  message: string;
  description?: string;
  iconClassName?: string;
}

export function EmptyStateCard({
  icon: Icon,
  message,
  description,
  iconClassName = 'text-gray-500',
}: EmptyStateCardProps) {
  return (
    <BaseCard variant="glass" className="p-6">
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Icon className={`w-10 h-10 mb-3 ${iconClassName}`} />
        <p className="text-gray-400">{message}</p>
        {description && (
          <p className="text-sm text-gray-500 mt-1">{description}</p>
        )}
      </div>
    </BaseCard>
  );
}
