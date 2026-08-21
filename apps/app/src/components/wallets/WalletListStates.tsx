import { View } from 'react-native';

import { SkeletonBlock } from '@/components/ui/Skeleton';

export function WalletListSkeleton() {
  return (
    <View>
      {[0, 1, 2].map((item) => (
        <View key={item} className="flex-row items-center gap-3 px-1 py-3">
          <View className="flex-1">
            <SkeletonBlock className="h-4 w-28" />
            <SkeletonBlock className="mt-2 h-3 w-36 rounded-full" />
          </View>
          <SkeletonBlock className="h-8 w-24 rounded-full" />
        </View>
      ))}
    </View>
  );
}
