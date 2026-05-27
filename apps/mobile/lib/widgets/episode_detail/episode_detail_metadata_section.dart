import 'package:flutter/material.dart';

import '../../models/episode.dart';
import '../bookmark_button.dart';
import '../episode_hero_frame.dart';
import '../share_button.dart';

class EpisodeDetailMetadataSection extends StatelessWidget {
  const EpisodeDetailMetadataSection({super.key, required this.episode});

  final Episode episode;

  @override
  Widget build(BuildContext context) {
    return EpisodeHeroFrame(
      height: 220,
      iconConfig: const EpisodeHeroIconConfig(
        right: -14,
        top: 24,
        size: 100,
        opacity: 0.10,
      ),
      child: EpisodeHeroText(episode: episode, showDateSeparator: true),
    );
  }
}

class EpisodeDetailActionRow extends StatelessWidget {
  const EpisodeDetailActionRow({super.key, required this.episode});

  final Episode episode;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceEvenly,
      children: [
        BookmarkButton(episode: episode),
        ShareButton(episode: episode),
      ],
    );
  }
}
