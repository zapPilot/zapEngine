import 'package:flutter/material.dart';

import '../models/episode.dart';
import '../theme/colors.dart';
import 'like_toggle_scaffold.dart';

class BookmarkButton extends StatelessWidget {
  const BookmarkButton({
    super.key,
    required this.episode,
    this.compact = false,
  });

  final Episode episode;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final iconSize = compact ? 18.0 : 21.0;

    return LikeToggleScaffold(
      episode: episode,
      builder: (context, state, enabled, onPressed) => IconButton(
        tooltip: state.liked ? 'Remove from favorites' : 'Save to favorites',
        visualDensity: compact ? VisualDensity.compact : VisualDensity.standard,
        color: state.liked ? AppColors.accent : AppColors.textSecondary,
        icon: Icon(
          state.liked ? Icons.bookmark_rounded : Icons.bookmark_border_rounded,
          size: iconSize,
        ),
        onPressed: onPressed,
      ),
    );
  }
}
