import 'package:flutter/material.dart';

import '../../models/episode.dart';
import '../../theme/colors.dart';
import '../share_button.dart';

class EpisodeDetailAppBar extends StatelessWidget
    implements PreferredSizeWidget {
  const EpisodeDetailAppBar({
    super.key,
    required this.episode,
    required this.showBackground,
    required this.onBack,
  });

  final Episode episode;
  final bool showBackground;
  final VoidCallback onBack;

  @override
  Size get preferredSize => const Size.fromHeight(kToolbarHeight);

  @override
  Widget build(BuildContext context) {
    final backgroundColor = showBackground
        ? AppColors.background.withValues(alpha: 0.94)
        : Colors.transparent;

    return AppBar(
      backgroundColor: backgroundColor,
      surfaceTintColor: Colors.transparent,
      centerTitle: true,
      leading: IconButton(
        tooltip: 'Back',
        icon: const Icon(Icons.arrow_back_ios_rounded),
        onPressed: onBack,
      ),
      title: const Text('From Fed to Chain'),
      actions: [
        Padding(
          padding: const EdgeInsets.only(right: 8),
          child: ShareButton(episode: episode, compact: true),
        ),
      ],
    );
  }
}
