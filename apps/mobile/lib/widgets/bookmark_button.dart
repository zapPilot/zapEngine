import 'package:flutter/material.dart';

import 'like_toggle_scaffold.dart';

class BookmarkButton extends EpisodeLikeToggleButton {
  const BookmarkButton({
    super.key,
    required super.episode,
    super.compact = false,
  });

  @override
  Widget build(BuildContext context) => LikeToggleScaffold(
        episode: episode,
        builder: (context, state, enabled, onPressed) {
          return IconButton(
            tooltip:
                state.liked ? 'Remove from favorites' : 'Save to favorites',
            visualDensity:
                compact ? VisualDensity.compact : VisualDensity.standard,
            color: likeToggleForegroundColor(state),
            icon: LikeToggleStateIcon.bookmark(state: state, compact: compact),
            onPressed: onPressed,
          );
        },
      );
}
