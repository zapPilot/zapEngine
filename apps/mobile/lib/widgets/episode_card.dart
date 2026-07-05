import 'package:flutter/material.dart';
import 'package:zapengine_tokens/design_tokens.dart';

import '../models/episode.dart';
import '../models/episode_status.dart';
import '../screens/episode_detail_screen.dart';
import '../theme/colors.dart';
import '../utils/date_format.dart';
import 'bookmark_button.dart';
import 'episode_status_badge.dart';
import 'play_pause_button.dart';
import 'share_button.dart';

class EpisodeCard extends StatelessWidget {
  const EpisodeCard({
    super.key,
    required this.episode,
    required this.isPlaying,
    required this.isLoading,
    required this.onPlay,
    this.onDelete,
    this.deleteLabel = 'Delete',
    this.supportingContent,
    this.queueEpisodes,
  });

  final Episode episode;
  final VoidCallback onPlay;
  final VoidCallback? onDelete;
  final String? deleteLabel;
  final Widget? supportingContent;
  final bool isPlaying;
  final bool isLoading;
  final List<Episode>? queueEpisodes;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final playButton = PlayPauseButton(
      isPlaying: isPlaying,
      isLoading: isLoading,
      onPressed: onPlay,
      variant: PlayPauseButtonVariant.secondary,
    );

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
      child: Material(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(ZapTokens.radiusCard),
        child: InkWell(
          borderRadius: BorderRadius.circular(ZapTokens.radiusCard),
          onTap: () => _openDetail(context),
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Padding(
                  padding: const EdgeInsets.only(top: 14),
                  child: EpisodeStatusBadge(status: episode.status),
                ),
                const SizedBox(width: 10),
                playButton,
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        episode.title,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.titleMedium,
                      ),
                      if (supportingContent != null) ...[
                        const SizedBox(height: 8),
                        supportingContent!,
                      ],
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 10,
                        runSpacing: 8,
                        crossAxisAlignment: WrapCrossAlignment.center,
                        children: [
                          Text(
                            formatEpisodeDate(episode.createdAt),
                            style: theme.textTheme.bodySmall,
                          ),
                          BookmarkButton(episode: episode, compact: true),
                          ShareButton(episode: episode, compact: true),
                        ],
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                IconButton(
                  tooltip: 'More options',
                  visualDensity: VisualDensity.compact,
                  icon: const Icon(
                    Icons.more_horiz_rounded,
                    color: AppColors.textSecondary,
                  ),
                  onPressed: () => _showMoreOptions(context),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  void _openDetail(BuildContext context) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => EpisodeDetailScreen(
          episode: episode,
          queueEpisodes: queueEpisodes,
        ),
      ),
    );
  }

  void _showMoreOptions(BuildContext context) {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: AppColors.surfaceElevated,
      showDragHandle: true,
      builder: (sheetContext) {
        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Builder(
                builder: (tileContext) => ListTile(
                  leading: const Icon(
                    Icons.ios_share_rounded,
                    color: AppColors.textSecondary,
                  ),
                  title: const Text('Share'),
                  onTap: () async {
                    final sharePositionOrigin =
                        ShareButton.sharePositionOriginFor(tileContext);
                    Navigator.pop(sheetContext);
                    await ShareButton.share(
                      context,
                      episode,
                      sharePositionOrigin: sharePositionOrigin,
                    );
                  },
                ),
              ),
              if (onDelete != null)
                ListTile(
                  leading: const Icon(
                    Icons.delete_outline_rounded,
                    color: Colors.redAccent,
                  ),
                  title: Text(
                    deleteLabel ?? 'Delete',
                    style: const TextStyle(color: Colors.redAccent),
                  ),
                  onTap: () {
                    Navigator.pop(sheetContext);
                    onDelete!();
                  },
                ),
              const SizedBox(height: 8),
            ],
          ),
        );
      },
    );
  }
}
