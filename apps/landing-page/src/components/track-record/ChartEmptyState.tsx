import { classNames } from '@/lib/classNames';

interface ChartEmptyStateProps {
  className?: string;
  emptyClassName: string;
  message: string;
}

export function ChartEmptyState({
  className,
  emptyClassName,
  message,
}: ChartEmptyStateProps) {
  return (
    <div className={classNames(emptyClassName, className)}>
      <p>{message}</p>
    </div>
  );
}
