import 'package:flutter/material.dart';

import '../theme/colors.dart';

enum PlayPauseButtonVariant { primary, secondary }

class PlayPauseButton extends StatelessWidget {
  const PlayPauseButton({
    super.key,
    required this.isPlaying,
    required this.isLoading,
    required this.onPressed,
    this.enabled = true,
    this.label,
    this.variant = PlayPauseButtonVariant.primary,
    this.fixedSize,
    this.iconSize,
    this.spinnerSize = 18,
    this.tooltip,
  });

  final bool isPlaying;
  final bool isLoading;
  final bool enabled;
  final VoidCallback onPressed;
  final String? label;
  final PlayPauseButtonVariant variant;
  final Size? fixedSize;
  final double? iconSize;
  final double spinnerSize;
  final String? tooltip;

  @override
  Widget build(BuildContext context) {
    final effectiveTooltip = tooltip ?? (isPlaying ? 'Pause' : 'Play');
    final effectiveOnPressed = enabled && !isLoading ? onPressed : null;

    if (label != null) {
      return FilledButton.icon(
        onPressed: effectiveOnPressed,
        icon: _iconContent(AppColors.background),
        label: Text(label!),
      );
    }

    final colors = _variantColors();
    return IconButton.filled(
      tooltip: effectiveTooltip,
      style: IconButton.styleFrom(
        fixedSize: fixedSize,
        backgroundColor: colors.background,
        foregroundColor: colors.foreground,
      ),
      onPressed: effectiveOnPressed,
      icon: _iconContent(colors.foreground),
    );
  }

  Widget _iconContent(Color progressColor) {
    if (isLoading) {
      return SizedBox.square(
        dimension: spinnerSize,
        child: CircularProgressIndicator(strokeWidth: 2, color: progressColor),
      );
    }

    return Icon(
      isPlaying ? Icons.pause_rounded : Icons.play_arrow_rounded,
      size: iconSize,
    );
  }

  _PlayPauseButtonColors _variantColors() {
    switch (variant) {
      case PlayPauseButtonVariant.primary:
        return const _PlayPauseButtonColors(
          background: AppColors.accent,
          foreground: AppColors.background,
        );
      case PlayPauseButtonVariant.secondary:
        return const _PlayPauseButtonColors(
          background: AppColors.surfaceElevated,
          foreground: AppColors.accent,
        );
    }
  }
}

class _PlayPauseButtonColors {
  const _PlayPauseButtonColors({
    required this.background,
    required this.foreground,
  });

  final Color background;
  final Color foreground;
}
