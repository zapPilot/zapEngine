import { RefreshCw, Wallet } from 'lucide-react-native';
import { Text, View } from 'react-native';

import { SkeletonBlock } from '@/components/ui/Skeleton';
import { Tap } from '@/components/ui/Tap';

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

/** Doubles as the failure state — loadWallets swallows fetch errors. */
export function EmptyWalletList({ onRefresh }: { onRefresh: () => void }) {
  return (
    <View className="items-center px-4 py-6">
      <View
        className="h-10 w-10 items-center justify-center rounded-full border"
        style={{
          borderColor: 'rgba(212,197,163,.2)',
          backgroundColor: 'rgba(212,197,163,.07)',
        }}
      >
        <Wallet size={17} strokeWidth={1.8} color="#d4c5a3" />
      </View>
      <Text className="mt-3 font-sans-semibold text-[13.5px] text-ink">
        No wallets in this bundle
      </Text>
      <Text className="mt-1 max-w-[270px] text-center text-[11.5px] leading-[17px] text-ink-dim">
        Wallets you add appear here and feed the combined portfolio.
      </Text>
      <Tap
        accessibilityLabel="Refresh wallet list"
        accessibilityRole="button"
        className="mt-3 flex-row items-center gap-1.5 rounded-full border px-3 py-1.5"
        style={{
          borderColor: 'rgba(212,197,163,.22)',
          backgroundColor: 'rgba(212,197,163,.07)',
        }}
        onPress={onRefresh}
      >
        <RefreshCw size={12} strokeWidth={2} color="#d4c5a3" />
        <Text className="font-sans-semibold text-[11px] text-accent">
          Refresh
        </Text>
      </Tap>
    </View>
  );
}
