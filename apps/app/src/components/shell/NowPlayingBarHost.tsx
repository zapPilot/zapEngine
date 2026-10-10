import { usePathname, useRouter } from 'expo-router';
import { NowPlayingBar } from '@/components/podcast/NowPlayingBar';
import { podcastEpisodeHref } from '@/integration/podcastRoutes';
import { usePodcastPlayer } from '@/providers/PodcastPlayerProvider';
export function NowPlayingBarHost({
  layout = 'bar',
}: {
  layout?: 'bar' | 'card';
}) {
  const player = usePodcastPlayer();
  const pathname = usePathname();
  const router = useRouter();
  if (
    pathname === '/listen' ||
    pathname.startsWith('/podcast/') ||
    pathname === '/e' ||
    pathname.startsWith('/e/')
  )
    return null;
  return (
    <NowPlayingBar
      layout={layout}
      player={player}
      onOpen={(episode) =>
        router.push(
          podcastEpisodeHref(episode.localizationId, episode.languageCode),
        )
      }
    />
  );
}
