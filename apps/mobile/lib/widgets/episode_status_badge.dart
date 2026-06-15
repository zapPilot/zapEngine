import 'package:flutter/material.dart';

import '../models/episode_status.dart';
import '../theme/colors.dart';

class EpisodeStatusBadge extends StatelessWidget {
  const EpisodeStatusBadge({super.key, required this.status, this.progress});

  final EpisodeStatus status;
  final double? progress;

  @override
  Widget build(BuildContext context) {
    return SizedBox.square(
      dimension: 16,
      child: Center(
        child: switch (status) {
          EpisodeStatus.completed => const Icon(
            Icons.check_circle_rounded,
            color: AppColors.success,
            size: 16,
          ),
          EpisodeStatus.inProgress => _ProgressMark(progress: progress),
          EpisodeStatus.unplayed => Container(
            width: 8,
            height: 8,
            decoration: const BoxDecoration(
              color: AppColors.accent,
              shape: BoxShape.circle,
            ),
          ),
        },
      ),
    );
  }
}

class _ProgressMark extends StatelessWidget {
  const _ProgressMark({required this.progress});

  final double? progress;

  @override
  Widget build(BuildContext context) {
    final value = progress?.clamp(0, 1).toDouble();
    return SizedBox(
      width: 16,
      height: 5,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: AppColors.accent.withValues(alpha: 0.22),
          borderRadius: BorderRadius.circular(999),
        ),
        child: Align(
          alignment: Alignment.centerLeft,
          child: FractionallySizedBox(
            widthFactor: value ?? 0.55,
            child: DecoratedBox(
              decoration: BoxDecoration(
                color: AppColors.accent,
                borderRadius: BorderRadius.circular(999),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
