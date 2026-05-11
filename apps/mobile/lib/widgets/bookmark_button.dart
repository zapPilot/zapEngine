import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/episode.dart';
import '../state/auth_provider.dart';
import '../state/likes_provider.dart';
import '../theme/colors.dart';

class BookmarkButton extends StatefulWidget {
  const BookmarkButton({
    super.key,
    required this.episode,
    this.compact = false,
  });

  final Episode episode;
  final bool compact;

  @override
  State<BookmarkButton> createState() => _BookmarkButtonState();
}

class _BookmarkButtonState extends State<BookmarkButton>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 180),
    lowerBound: 0.92,
    upperBound: 1.18,
  )..value = 1;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final likes = context.watch<LikesProvider>();
    final state = likes.stateFor(widget.episode);
    final iconSize = widget.compact ? 18.0 : 21.0;

    return ScaleTransition(
      scale: _controller,
      child: IconButton(
        tooltip: state.liked ? 'Remove from favorites' : 'Save to favorites',
        visualDensity:
            widget.compact ? VisualDensity.compact : VisualDensity.standard,
        color: state.liked ? AppColors.accent : AppColors.textSecondary,
        icon: Icon(
          state.liked ? Icons.bookmark_rounded : Icons.bookmark_border_rounded,
          size: iconSize,
        ),
        onPressed: auth.currentUser == null
            ? null
            : () async {
                await _controller.forward(from: 0.92);
                if (!mounted) return;
                _controller.reverse();
                await likes.toggle(widget.episode, auth.currentUser!.id);
              },
      ),
    );
  }
}
