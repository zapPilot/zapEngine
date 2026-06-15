import 'package:flutter/material.dart';

import 'like_toggle_scaffold.dart';

class LikeButton extends EpisodeLikeToggleButton {
  const LikeButton({super.key, required super.episode, super.compact = false});

  @override
  Widget build(BuildContext context) {
    return LikeToggleScaffold(
      episode: episode,
      builder: (context, state, enabled, onPressed) {
        final foregroundColor = likeToggleForegroundColor(state);

        return TextButton.icon(
          style: TextButton.styleFrom(
            foregroundColor: foregroundColor,
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
          icon: LikeToggleStateIcon.favorite(state: state, compact: compact),
          label: Text(
            '${state.count}',
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
              color: foregroundColor,
              fontWeight: FontWeight.w700,
            ),
          ),
          onPressed: onPressed,
        );
      },
    );
  }
}
