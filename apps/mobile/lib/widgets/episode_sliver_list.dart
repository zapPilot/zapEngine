import 'package:flutter/material.dart';

import '../models/episode.dart';
import '../state/playback_provider.dart';
import 'episode_collection_slivers.dart';
import 'episode_card.dart';

typedef EpisodeCardWrapper =
    Widget Function(BuildContext context, Episode episode, Widget child);

class EpisodeSliverList extends StatelessWidget {
  const EpisodeSliverList({
    super.key,
    required this.episodes,
    required this.playback,
    required this.onPlay,
    this.onDelete,
    this.deleteLabel = 'Delete',
    this.wrapper,
  });

  final List<Episode> episodes;
  final PlaybackProvider playback;
  final ValueChanged<Episode> onPlay;
  final ValueChanged<Episode>? onDelete;
  final String deleteLabel;
  final EpisodeCardWrapper? wrapper;

  @override
  Widget build(BuildContext context) {
    return SliverList.builder(
      itemCount: episodes.length,
      itemBuilder: (context, index) {
        final episode = episodes[index];
        final card = EpisodeCard(
          episode: episode,
          isPlaying: playback.isEpisodePlaying(episode.id),
          isLoading: playback.loadingEpisodeId == episode.id,
          onPlay: () => onPlay(episode),
          onDelete: onDelete == null ? null : () => onDelete!(episode),
          deleteLabel: deleteLabel,
        );

        return wrapper?.call(context, episode, card) ?? card;
      },
    );
  }
}

class EpisodeListBottomSpacer extends StatelessWidget {
  const EpisodeListBottomSpacer({super.key});

  @override
  Widget build(BuildContext context) {
    return const SliverToBoxAdapter(
      child: SizedBox(height: kEpisodeListBottomPadding),
    );
  }
}
