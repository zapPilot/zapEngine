import { useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Play } from 'lucide-react-native';
import { memo, useEffect, useMemo, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { Tap } from '@/components/ui/Tap';
import type { PodcastEpisodeVideo } from '@/integration/podcastFeed';
import { useVideoPlaybackCoordinator } from '@/providers/VideoPlaybackCoordinatorProvider';

const FULLSCREEN_OPTIONS = { enable: true } as const;

export const EpisodeVideoPlayer = memo(function EpisodeVideoPlayer({
  title,
  video,
  onPlaybackStart,
}: {
  title: string;
  video: PodcastEpisodeVideo;
  onPlaybackStart: () => void;
}) {
  const { registerVideo } = useVideoPlaybackCoordinator();
  const [showPoster, setShowPoster] = useState(true);
  const source = useMemo(
    () => ({
      uri: video.url,
      contentType: 'progressive' as const,
      metadata: {
        title,
        artwork: video.thumbnailUrl,
      },
    }),
    [title, video.thumbnailUrl, video.url],
  );
  const posterSource = useMemo(
    () => ({ uri: video.thumbnailUrl }),
    [video.thumbnailUrl],
  );
  const player = useVideoPlayer(source);
  const { isPlaying } = useEvent(player, 'playingChange', {
    isPlaying: player.playing,
  });

  useEffect(() => registerVideo(() => player.pause()), [player, registerVideo]);

  useEffect(() => {
    if (!isPlaying) return;
    onPlaybackStart();
  }, [isPlaying, onPlaybackStart]);

  const startPlayback = () => {
    onPlaybackStart();
    setShowPoster(false);
    player.play();
  };

  return (
    <View className="px-5 pt-5">
      <View
        className="overflow-hidden rounded-[22px] border border-line bg-black"
        style={styles.frame}
      >
        <VideoView
          player={player}
          nativeControls
          contentFit="contain"
          fullscreenOptions={FULLSCREEN_OPTIONS}
          style={styles.video}
        />
        {showPoster ? (
          <Tap
            accessibilityRole="button"
            accessibilityLabel={`Play video: ${title}`}
            onPress={startPlayback}
            className="absolute inset-0 items-center justify-center bg-black"
          >
            <Image
              accessibilityIgnoresInvertColors
              source={posterSource}
              resizeMode="cover"
              style={styles.poster}
            />
            <View className="absolute inset-0 bg-[rgba(0,0,0,.28)]" />
            <View className="h-16 w-16 items-center justify-center rounded-full border border-[rgba(255,255,255,.5)] bg-[rgba(10,10,10,.72)]">
              <Play size={28} strokeWidth={2} color="#f5f1e8" fill="#f5f1e8" />
            </View>
            <Text className="absolute bottom-3 right-3 rounded-md bg-[rgba(10,10,10,.76)] px-2 py-1 font-mono text-[10px] text-white">
              Video · {Math.ceil(video.durationSeconds / 60)} min
            </Text>
          </Tap>
        ) : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  frame: {
    width: '100%',
    aspectRatio: 16 / 9,
  },
  video: {
    width: '100%',
    height: '100%',
  },
  poster: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    width: '100%',
    height: '100%',
  },
});
