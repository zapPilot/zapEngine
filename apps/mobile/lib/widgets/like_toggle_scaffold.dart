import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/episode.dart';
import '../state/auth_provider.dart';
import '../state/likes_provider.dart';
import '../theme/colors.dart';

typedef LikeToggleBuilder =
    Widget Function(
      BuildContext context,
      EpisodeLikeState state,
      bool enabled,
      VoidCallback? onPressed,
    );

abstract class EpisodeLikeToggleButton extends StatelessWidget {
  const EpisodeLikeToggleButton({
    super.key,
    required this.episode,
    this.compact = false,
  });

  final Episode episode;
  final bool compact;
}

Color likeToggleForegroundColor(EpisodeLikeState state) {
  return state.liked ? AppColors.accent : AppColors.textSecondary;
}

double likeToggleIconSize(bool compact) {
  return compact ? 18.0 : 21.0;
}

class LikeToggleStateIcon extends StatelessWidget {
  const LikeToggleStateIcon({
    super.key,
    required this.state,
    required this.likedIcon,
    required this.unlikedIcon,
    required this.compact,
  });

  const LikeToggleStateIcon.favorite({
    super.key,
    required this.state,
    required this.compact,
  }) : likedIcon = Icons.favorite_rounded,
       unlikedIcon = Icons.favorite_border_rounded;

  const LikeToggleStateIcon.bookmark({
    super.key,
    required this.state,
    required this.compact,
  }) : likedIcon = Icons.bookmark_rounded,
       unlikedIcon = Icons.bookmark_border_rounded;

  final EpisodeLikeState state;
  final IconData likedIcon;
  final IconData unlikedIcon;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    return Icon(
      state.liked ? likedIcon : unlikedIcon,
      size: likeToggleIconSize(compact),
    );
  }
}

class LikeToggleScaffold extends StatefulWidget {
  const LikeToggleScaffold({
    super.key,
    required this.episode,
    required this.builder,
  });

  final Episode episode;
  final LikeToggleBuilder builder;

  @override
  State<LikeToggleScaffold> createState() => _LikeToggleScaffoldState();
}

class _LikeToggleScaffoldState extends State<LikeToggleScaffold>
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
    final enabled = auth.currentUser != null;

    return ScaleTransition(
      scale: _controller,
      child: widget.builder(
        context,
        state,
        enabled,
        enabled ? () => _toggle(likes, auth.currentUser!.id) : null,
      ),
    );
  }

  Future<void> _toggle(LikesProvider likes, String userId) async {
    await _controller.forward(from: 0.92);
    if (!mounted) return;
    _controller.reverse();
    await likes.toggle(widget.episode, userId);
  }
}
