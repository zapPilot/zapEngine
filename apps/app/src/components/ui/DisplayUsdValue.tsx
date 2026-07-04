import { Text } from 'react-native';

import { SkeletonBlock } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';
import { splitUsd } from '@/lib/format';

interface DisplayUsdValueProps {
  value: number | null;
  loading?: boolean;
  valueClassName: string;
  fractionClassName: string;
  skeletonClassName: string;
  emptyClassName?: string;
}

export function DisplayUsdValue({
  value,
  loading = false,
  valueClassName,
  fractionClassName,
  skeletonClassName,
  emptyClassName,
}: DisplayUsdValueProps) {
  if (loading) {
    return <SkeletonBlock className={skeletonClassName} />;
  }

  if (typeof value !== 'number') {
    return <Text className={cn(valueClassName, emptyClassName)}>-</Text>;
  }

  const { whole, fraction } = splitUsd(value);
  return (
    <Text className={valueClassName}>
      {whole}
      <Text className={fractionClassName}>{fraction}</Text>
    </Text>
  );
}
