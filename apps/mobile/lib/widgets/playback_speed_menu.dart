import 'package:flutter/material.dart';

import '../theme/colors.dart';

const playbackSpeedOptions = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0];

class PlaybackSpeedMenu extends StatelessWidget {
  const PlaybackSpeedMenu({
    super.key,
    required this.speed,
    required this.onSelected,
  });

  final double speed;
  final ValueChanged<double> onSelected;

  @override
  Widget build(BuildContext context) {
    return PopupMenuButton<double>(
      tooltip: 'Playback speed',
      initialValue: speed,
      onSelected: onSelected,
      itemBuilder: (context) => [
        for (final option in playbackSpeedOptions)
          PopupMenuItem(
            value: option,
            child: Text('${formatPlaybackSpeed(option)}x'),
          ),
      ],
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        decoration: BoxDecoration(
          color: AppColors.accent.withValues(alpha: 0.15),
          borderRadius: BorderRadius.circular(6),
        ),
        child: Text(
          '${formatPlaybackSpeed(speed)}x',
          style: const TextStyle(
            color: AppColors.accent,
            fontWeight: FontWeight.w600,
            fontSize: 12,
          ),
        ),
      ),
    );
  }
}

String formatPlaybackSpeed(double speed) {
  final hundredths = (speed * 100).round();
  if (hundredths % 10 == 0) return speed.toStringAsFixed(1);
  return speed.toStringAsFixed(2);
}
