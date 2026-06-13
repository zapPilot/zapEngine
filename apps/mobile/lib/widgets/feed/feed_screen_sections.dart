import 'package:flutter/material.dart';

import '../../models/episode.dart';
import '../../models/episode_status.dart';
import '../../state/playback_provider.dart';
import '../../theme/colors.dart';
import '../../utils/episode_sorting.dart';
import '../centered_state_message.dart';
import '../episode_sliver_list.dart';

class FeedEpisodeGroups {
  const FeedEpisodeGroups({
    required this.inProgress,
    required this.unplayed,
    required this.completed,
  });

  final List<Episode> inProgress;
  final List<Episode> unplayed;
  final List<Episode> completed;
}

FeedEpisodeGroups groupFeedEpisodesByStatus(List<Episode> episodes) {
  final inProgress = <Episode>[];
  final unplayed = <Episode>[];
  final completed = <Episode>[];

  for (final episode in episodes) {
    switch (episode.status) {
      case EpisodeStatus.inProgress:
        inProgress.add(episode);
      case EpisodeStatus.unplayed:
        unplayed.add(episode);
      case EpisodeStatus.completed:
        completed.add(episode);
    }
  }

  inProgress.sort(compareEpisodesOldestFirst);
  unplayed.sort(compareEpisodesOldestFirst);
  completed.sort(compareEpisodesNewestFirst);

  return FeedEpisodeGroups(
    inProgress: inProgress,
    unplayed: unplayed,
    completed: completed,
  );
}

Episode? heroEpisodeForFeed(
  List<Episode> episodes,
  FeedEpisodeGroups groups,
) {
  if (groups.inProgress.isNotEmpty) return groups.inProgress.first;
  if (groups.unplayed.isNotEmpty) return groups.unplayed.first;
  if (groups.completed.isNotEmpty) return groups.completed.last;
  if (episodes.isNotEmpty) {
    final oldestFirst = List<Episode>.of(episodes)
      ..sort(compareEpisodesOldestFirst);
    return oldestFirst.first;
  }
  return null;
}

List<Widget> buildFeedSection({
  required String title,
  required List<Episode> episodes,
  required PlaybackProvider playback,
}) {
  return [
    SliverToBoxAdapter(child: _SectionTitle(title: title)),
    EpisodeSliverList(
      episodes: episodes,
      playback: playback,
      onPlay: (episode) => playback.toggle(episode),
    ),
  ];
}

class FeedLoadMoreStatus extends StatelessWidget {
  const FeedLoadMoreStatus({
    super.key,
    required this.loading,
    required this.error,
    required this.hasMore,
    required this.onRetry,
  });

  final bool loading;
  final String? error;
  final bool hasMore;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    if (loading) {
      return const Padding(
        padding: EdgeInsets.all(24),
        child: Center(child: CircularProgressIndicator()),
      );
    }

    if (error != null) {
      return Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
        child: OutlinedButton.icon(
          onPressed: onRetry,
          icon: const Icon(Icons.refresh_rounded),
          label: const Text('Retry'),
        ),
      );
    }

    return SizedBox(height: hasMore ? 24 : 12);
  }
}

class FeedEmptyState extends StatelessWidget {
  const FeedEmptyState({super.key});

  @override
  Widget build(BuildContext context) {
    return CenteredStateMessage(
      title: 'No episodes yet.',
      padding: EdgeInsets.zero,
      titleStyle: Theme.of(
        context,
      ).textTheme.bodyMedium?.copyWith(color: AppColors.textSecondary),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle({required this.title});

  final String title;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
      child: Row(
        children: [
          Text(
            title,
            style: Theme.of(
              context,
            ).textTheme.titleMedium?.copyWith(fontSize: 18),
          ),
          const SizedBox(width: 12),
          const Expanded(child: Divider()),
        ],
      ),
    );
  }
}
