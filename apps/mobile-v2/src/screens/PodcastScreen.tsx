import { Headphones } from 'lucide-react-native';
import { Text, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { ScreenScrollView } from '@/components/ui/ScreenScrollView';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import { usePodcastEpisodes } from '@/integration/podcastFeed';

export function PodcastScreen() {
  const episodes = usePodcastEpisodes();

  return (
    <ScreenScrollView>
      <ScreenHeader title="Podcast" />
      <View className="px-5 pt-4">
        <Card className="p-5">
          <View className="flex-row items-center gap-3">
            <View className="h-10 w-10 items-center justify-center rounded-full bg-accent-soft">
              <Headphones size={19} strokeWidth={1.8} color="#d4c5a3" />
            </View>
            <View className="flex-1">
              <Text className="font-sans-semibold text-[15px] text-ink">
                From Fed to Chain
              </Text>
              <Text className="mt-1 text-[12px] text-ink-dim">
                Market regime notes and portfolio context.
              </Text>
            </View>
          </View>
        </Card>
        <View className="mt-5 gap-3">
          {episodes.isLoading ? (
            <>
              <SkeletonBlock className="h-[74px] w-full rounded-2xl" />
              <SkeletonBlock className="h-[74px] w-full rounded-2xl" />
            </>
          ) : (
            (episodes.data ?? []).slice(0, 8).map((episode) => (
              <Card key={episode.id} className="p-4">
                <Text className="font-sans-semibold text-[14px] text-ink">
                  {episode.title}
                </Text>
                <Text className="mt-2 font-mono text-[10px] uppercase tracking-[0.8px] text-ink-faint">
                  {episode.languageCode}
                </Text>
              </Card>
            ))
          )}
        </View>
      </View>
    </ScreenScrollView>
  );
}
