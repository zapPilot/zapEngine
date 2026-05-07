import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/episode.dart';
import '../state/auth_provider.dart';
import '../state/likes_provider.dart';
import '../theme/colors.dart';

class LikeButton extends StatefulWidget {
  const LikeButton({super.key, required this.episode, this.compact = false});

  final Episode episode;
  final bool compact;

  @override
  State<LikeButton> createState() => _LikeButtonState();
}

class _LikeButtonState extends State<LikeButton>
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
      child: TextButton.icon(
        style: TextButton.styleFrom(
          foregroundColor:
              state.liked ? AppColors.accent : AppColors.textSecondary,
          padding: EdgeInsets.symmetric(
            horizontal: widget.compact ? 8 : 10,
            vertical: widget.compact ? 4 : 8,
          ),
          minimumSize: widget.compact ? const Size(42, 34) : const Size(58, 40),
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
