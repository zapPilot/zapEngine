import 'package:flutter/material.dart';

import '../models/episode.dart';
import '../theme/colors.dart';
import 'like_toggle_scaffold.dart';

class LikeButton extends StatelessWidget {
  const LikeButton({super.key, required this.episode, this.compact = false});

  final Episode episode;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final iconSize = compact ? 18.0 : 21.0;

    return LikeToggleScaffold(
      episode: episode,
      builder: (context, state, enabled, onPressed) => TextButton.icon(
        style: TextButton.styleFrom(
          foregroundColor:
              state.liked ? AppColors.accent : AppColors.textSecondary,
          padding: EdgeInsets.symmetric(
            horizontal: compact ? 8 : 10,
            vertical: compact ? 4 : 8,
          ),
          minimumSize: compact ? const Size(42, 34) : const Size(58, 40),
          tapTargetSize: MaterialTapTargetSize.shrinkWrap,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
        icon: Icon(
          state.liked ? Icons.favorite_rounded : Icons.favorite_border_rounded,
          size: iconSize,
        ),
        label: Text(
          '${state.count}',
          style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: state.liked ? AppColors.accent : AppColors.textSecondary,
                fontWeight: FontWeight.w700,
              ),
        ),
        onPressed: onPressed,
      ),
    );
  }
}
