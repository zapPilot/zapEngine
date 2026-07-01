import 'package:flutter/material.dart';

import '../models/episode.dart';
import '../models/episode_status.dart';
import '../screens/episode_detail_screen.dart';
import '../theme/colors.dart';
import '../utils/date_format.dart';
import 'episode_hero_frame.dart';
import 'like_button.dart';
import 'play_pause_button.dart';
import 'share_button.dart';

class ContinueListeningCard extends StatelessWidget {
  const ContinueListeningCard({
    super.key,
    required this.episode,
    required this.allCompleted,
    required this.isPlaying,
    required this.isLoading,
    required this.onPlay,
    this.queueEpisodes,
  });

  final Episode episode;
  final bool allCompleted;
  final bool isPlaying;
  final bool isLoading;
  final VoidCallback onPlay;
  final List<Episode>? queueEpisodes;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final copy = _CardCopy.forEpisode(
      episode,
      allCompleted: allCompleted,
      isPlaying: isPlaying,
    );

    return EpisodeHeroFrame(
      constraints: const BoxConstraints(minHeight: 250),
      onTap: () {
        Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => EpisodeDetailScreen(
              episode: episode,
              queueEpisodes: queueEpisodes,
            ),
          ),
        );
      },
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              Text(
                copy.eyebrow,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: AppColors.accent,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  allCompleted
                      ? '${formatEpisodeDate(episode.createdAt)} 起'
                      : formatEpisodeDate(episode.createdAt),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.bodySmall,
                ),
              ),
            ],
          ),
          const SizedBox(height: 28),
          Text(
            copy.title,
            maxLines: 3,
            overflow: TextOverflow.ellipsis,
            style: theme.textTheme.headlineLarge,
          ),
          const SizedBox(height: 10),
          Text(
            copy.subtitle,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: theme.textTheme.bodyMedium?.copyWith(
              color: AppColors.textSecondary,
            ),
          ),
          const SizedBox(height: 20),
          Wrap(
            spacing: 12,
            runSpacing: 12,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              PlayPauseButton(
                isPlaying: isPlaying,
                isLoading: isLoading,
                onPressed: onPlay,
                label: copy.buttonLabel,
              ),
              LikeButton(episode: episode),
              ShareButton(episode: episode),
            ],
          ),
        ],
      ),
    );
  }
}

class _CardCopy {
  const _CardCopy({
    required this.eyebrow,
    required this.title,
    required this.subtitle,
    required this.buttonLabel,
  });

  final String eyebrow;
  final String title;
  final String subtitle;
  final String buttonLabel;

  static _CardCopy forEpisode(
    Episode episode, {
    required bool allCompleted,
    required bool isPlaying,
  }) {
    if (allCompleted) {
      return _CardCopy(
        eyebrow: '已全部聽完',
        title: '已全部聽完',
        subtitle: '重新從最舊一集開始播放',
        buttonLabel: isPlaying ? '暫停' : '重新從最舊開始',
      );
    }

    if (episode.status == EpisodeStatus.inProgress) {
      return _CardCopy(
        eyebrow: '繼續收聽',
        title: episode.title,
        subtitle:
            '上次收聽至 ${formatDuration(Duration(seconds: episode.lastPositionSeconds))}',
        buttonLabel: isPlaying ? '暫停' : '繼續收聽',
      );
    }

    return _CardCopy(
      eyebrow: '一鍵播放',
      title: episode.title,
      subtitle: '從最舊未聽集開始',
      buttonLabel: isPlaying ? '暫停' : '從最舊未聽開始',
    );
  }
}
