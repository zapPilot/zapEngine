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
  });

  final Episode episode;
  final bool allCompleted;
  final bool isPlaying;
  final bool isLoading;
  final VoidCallback onPlay;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final status = episode.status;
    final eyebrow = allCompleted
        ? '已全部聽完'
        : status == EpisodeStatus.inProgress
            ? '繼續收聽'
            : '一鍵播放';
    final title = allCompleted ? '已全部聽完' : episode.title;
    final subtitle = allCompleted
        ? '重新從最舊一集開始播放'
        : status == EpisodeStatus.inProgress
            ? '上次收聽至 ${_formatPosition(episode.lastPositionSeconds)}'
            : '從最舊未聽集開始';
    final buttonLabel = isPlaying
        ? '暫停'
        : allCompleted
            ? '重新從最舊開始'
            : status == EpisodeStatus.inProgress
                ? '繼續收聽'
                : '從最舊未聽開始';

    return EpisodeHeroFrame(
      height: 250,
      onTap: () {
        Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => EpisodeDetailScreen(episode: episode),
          ),
        );
      },
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(
                eyebrow,
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
          const Spacer(),
          Text(
            title,
            maxLines: 4,
            overflow: TextOverflow.ellipsis,
            style: theme.textTheme.headlineLarge,
          ),
          const SizedBox(height: 10),
          Text(
            subtitle,
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
                label: buttonLabel,
              ),
              LikeButton(episode: episode),
              ShareButton(episode: episode),
            ],
          ),
        ],
      ),
    );
  }

  static String _formatPosition(int seconds) {
    final duration = Duration(seconds: seconds);
    final minutes = duration.inMinutes;
    final remainingSeconds = duration.inSeconds.remainder(60);
    return '$minutes:${remainingSeconds.toString().padLeft(2, '0')}';
  }
}
