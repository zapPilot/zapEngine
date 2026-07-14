import { Pause, Play } from 'lucide-react-native';
import { Text, View } from 'react-native';

import { formatPodcastClock } from '@/components/podcast/episodeFormatters';
import type { EpisodeSortDirection } from '@/components/podcast/episodeSorting';
import { Card } from '@/components/ui/Card';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { RangeTabs } from '@/components/ui/RangeTabs';
import type { PodcastEpisode } from '@/integration/podcastFeed';

export type PlayUnheardMode =
  | 'unplayed'
  | 'inProgress'
  | 'allCompleted'
  | 'empty';

const NEWEST_LABEL = '最新';
const OLDEST_LABEL = '最舊';
const DIRECTION_OPTIONS = [NEWEST_LABEL, OLDEST_LABEL] as const;

interface CardCopy {
  eyebrow: string;
  title: string;
  subtitle: string;
  buttonLabel: string;
}

function resolveCopy(
  mode: PlayUnheardMode,
  target: PodcastEpisode | null,
  direction: EpisodeSortDirection,
  isPlaying: boolean,
): CardCopy {
  const fromEdge = direction === 'newest' ? '最新' : '最舊';

  if (mode === 'allCompleted') {
    return {
      eyebrow: '已全部聽完',
      title: '已全部聽完',
      subtitle: `重新從${fromEdge}一集開始播放`,
      buttonLabel: isPlaying ? '暫停' : `從${fromEdge}重新播放`,
    };
  }
  if (mode === 'inProgress' && target !== null) {
    return {
      eyebrow: '繼續收聽',
      title: target.title,
      subtitle: `上次收聽至 ${formatPodcastClock(target.lastPositionSeconds)}`,
      buttonLabel: isPlaying ? '暫停' : '繼續收聽',
    };
  }
  return {
    eyebrow: '一鍵播放',
    title: target?.title ?? '',
    subtitle: `從${fromEdge}未聽的一集開始`,
    buttonLabel: isPlaying ? '暫停' : '一鍵播放未聽',
  };
}

/**
 * Large one-tap "play unheard" CTA, ported from the mobile
 * `continue_listening_card.dart` (three states: play / resume / all-done) with a
 * newest/oldest direction toggle.
 */
export function PlayUnheardCard({
  mode,
  target,
  direction,
  isPlaying,
  onDirectionChange,
  onPlay,
}: {
  mode: PlayUnheardMode;
  target: PodcastEpisode | null;
  direction: EpisodeSortDirection;
  isPlaying: boolean;
  onDirectionChange: (direction: EpisodeSortDirection) => void;
  onPlay: () => void;
}) {
  if (mode === 'empty') return null;

  const copy = resolveCopy(mode, target, direction, isPlaying);

  return (
    <View className="px-5 pt-3">
      <Card className="p-4">
        <View className="flex-row items-center justify-between gap-3">
          <Text className="font-mono text-[10px] uppercase tracking-[1.1px] text-accent">
            {copy.eyebrow}
          </Text>
          <RangeTabs
            options={DIRECTION_OPTIONS}
            value={direction === 'newest' ? NEWEST_LABEL : OLDEST_LABEL}
            onChange={(value) =>
              onDirectionChange(value === OLDEST_LABEL ? 'oldest' : 'newest')
            }
          />
        </View>
        <Text
          className="mt-2 font-sans-bold text-[19px] leading-[26px] text-ink"
          numberOfLines={2}
        >
          {copy.title}
        </Text>
        <Text className="mt-1 text-[12.5px] leading-[19px] text-ink-dim">
          {copy.subtitle}
        </Text>

        <View className="mt-3">
          <PrimaryButton accessibilityLabel={copy.buttonLabel} onPress={onPlay}>
            {isPlaying ? (
              <Pause size={16} strokeWidth={2.2} color="#0a0a0a" />
            ) : (
              <Play size={16} strokeWidth={2.2} color="#0a0a0a" />
            )}
            {copy.buttonLabel}
          </PrimaryButton>
        </View>
      </Card>
    </View>
  );
}
