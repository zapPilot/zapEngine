import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../models/episode.dart';
import '../../state/auth_provider.dart';
import '../../state/content_language_provider.dart';
import '../../state/feed_pagination_controller.dart';
import '../../state/playback_provider.dart';
import '../../theme/colors.dart';
import '../continue_listening_card.dart';
import '../episode_collection_slivers.dart';
import '../episode_sliver_list.dart';
import '../listened_section_header.dart';
import 'feed_screen_sections.dart';

class FeedScreenContent extends StatelessWidget {
  const FeedScreenContent({
    super.key,
    required this.scrollController,
    required this.listenedExpanded,
    required this.onToggleListenedExpanded,
    required this.onRefresh,
    required this.onLoadMore,
    required this.onSmartPlay,
  });

  final ScrollController scrollController;
  final bool listenedExpanded;
  final VoidCallback onToggleListenedExpanded;
  final RefreshCallback onRefresh;
  final VoidCallback onLoadMore;
  final ValueChanged<Episode> onSmartPlay;

  @override
  Widget build(BuildContext context) {
    final controller = context.watch<FeedPaginationController>();
    final user = context.watch<AuthProvider>().currentUser;
    context.watch<ContentLanguageProvider?>();
    final playback = context.watch<PlaybackProvider>();
    final groups = groupFeedEpisodesByStatus(controller.episodes);
    final heroEpisode = heroEpisodeForFeed(controller.episodes, groups);

    return RefreshIndicator(
      color: AppColors.accent,
      backgroundColor: AppColors.surfaceElevated,
      onRefresh: onRefresh,
      child: CustomScrollView(
        controller: scrollController,
        physics: const AlwaysScrollableScrollPhysics(),
        slivers: [
          SliverAppBar(
            pinned: true,
            title: const Text('From Fed to Chain'),
            actions: [
              Padding(
                padding: const EdgeInsets.only(right: 16),
                child: CircleAvatar(
                  radius: 18,
                  backgroundColor: AppColors.surfaceElevated,
                  foregroundColor: AppColors.accent,
                  child: Text(_avatarLabel(user?.email)),
                ),
              ),
            ],
          ),
          ...buildEpisodeCollectionSlivers(
            loading: controller.loading,
            error: controller.error,
            empty: controller.episodes.isEmpty,
            emptyState: const FeedEmptyState(),
            onRetry: onRefresh,
            contentSlivers: [
              if (heroEpisode != null)
                SliverToBoxAdapter(
                  child: ContinueListeningCard(
                    episode: heroEpisode,
                    allCompleted:
                        groups.inProgress.isEmpty && groups.unplayed.isEmpty,
                    isPlaying: playback.isEpisodePlaying(heroEpisode.id),
                    isLoading: playback.loadingEpisodeId == heroEpisode.id,
                    onPlay: () => onSmartPlay(heroEpisode),
                  ),
                ),
              if (groups.inProgress.isNotEmpty) ...[
                ...buildFeedSection(
                  title: '進行中',
                  episodes: groups.inProgress,
                  playback: playback,
                ),
              ],
              if (groups.unplayed.isNotEmpty) ...[
                ...buildFeedSection(
                  title: '未聽',
                  episodes: groups.unplayed,
                  playback: playback,
                ),
              ],
              if (groups.completed.isNotEmpty) ...[
                SliverToBoxAdapter(
                  child: ListenedSectionHeader(
                    count: groups.completed.length,
                    expanded: listenedExpanded,
                    onTap: onToggleListenedExpanded,
                  ),
                ),
                if (listenedExpanded)
                  EpisodeSliverList(
                    episodes: groups.completed,
                    playback: playback,
                    onPlay: (episode) => playback.toggle(episode),
                  ),
              ],
              SliverToBoxAdapter(
                child: FeedLoadMoreStatus(
                  loading: controller.loadingMore,
                  error: controller.loadMoreError,
                  hasMore: controller.nextCursor != null,
                  onRetry: onLoadMore,
                ),
              ),
              const EpisodeListBottomSpacer(),
            ],
          ),
        ],
      ),
    );
  }

  static String _avatarLabel(String? email) {
    final value = email?.trim();
    if (value == null || value.isEmpty) return 'F';
    return value.characters.first.toUpperCase();
  }
}
