import { Text } from './Text';
import { SkeletonBlock } from './Skeleton';
import { cn } from '@/lib/cn';
import { splitUsd } from '@/lib/format';
const sizes = {
  lg: { value: 'display', fraction: 'title', skeleton: 'h-control-lg w-56' },
  md: {
    value: 'display-sm',
    fraction: 'title-sm',
    skeleton: 'h-control-md w-48',
  },
} as const;
export function DisplayUsdValue({
  value,
  loading = false,
  size = 'lg',
  className,
}: {
  value: number | null;
  loading?: boolean;
  size?: keyof typeof sizes;
  className?: string;
}) {
  const style = sizes[size];
  if (loading)
    return <SkeletonBlock className={cn(style.skeleton, className)} />;
  if (typeof value !== 'number')
    return (
      <Text variant={style.value} tone="muted" className={cn(className)}>
        —
      </Text>
    );
  const { whole, fraction } = splitUsd(value);
  return (
    <Text variant={style.value} numeric className={cn(className)}>
      {whole}
      <Text variant={style.fraction} tone="secondary">
        {fraction}
      </Text>
    </Text>
  );
}
