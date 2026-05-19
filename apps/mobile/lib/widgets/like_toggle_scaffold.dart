import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/episode.dart';
import '../state/auth_provider.dart';
import '../state/likes_provider.dart';

typedef LikeToggleBuilder = Widget Function(
  BuildContext context,
  EpisodeLikeState state,
  bool enabled,
  VoidCallback? onPressed,
);

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
