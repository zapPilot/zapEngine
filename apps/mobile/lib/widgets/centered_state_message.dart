import 'package:flutter/material.dart';

import '../theme/colors.dart';

// Framed-icon visual sizing. Used by [CenteredStateMessage.hero] for the
// big "coming soon" hero treatment — kept private since these dimensions
// are an artistic choice tied to this widget, not a global design token.
const double _kFramedIconBoxSize = 76;
const double _kFramedIconBoxRadius = 20;

class CenteredStateMessage extends StatelessWidget {
  const CenteredStateMessage({
    super.key,
    required this.title,
    this.message,
    this.icon,
    this.iconSize = 42,
    this.framedIcon = false,
    this.iconSpacing = 16,
    this.padding = const EdgeInsets.all(24),
    this.titleStyle,
  });

  /// Hero variant — frames the icon in a rounded square, uses [titleLarge],
  /// removes outer padding (so callers can position it in their own frame),
  /// and bumps the icon spacing. The exact bundle the original
  /// `ComingSoonScreen` ships with — extracted to keep theme-selection
  /// responsibility inside the widget.
  const CenteredStateMessage.hero({
    super.key,
    required this.title,
    this.message,
    this.icon,
    this.iconSize = 34,
  }) : framedIcon = true,
       iconSpacing = 18,
       padding = EdgeInsets.zero,
       titleStyle = null;

  final String title;
  final String? message;
  final IconData? icon;
  final double iconSize;
  final bool framedIcon;
  final double iconSpacing;
  final EdgeInsetsGeometry padding;
  final TextStyle? titleStyle;

  @override
  Widget build(BuildContext context) {
    final iconWidget = _buildIcon();
    final theme = Theme.of(context);
    final effectiveTitleStyle =
        titleStyle ??
        (framedIcon ? theme.textTheme.titleLarge : theme.textTheme.titleMedium);

    return Center(
      child: Padding(
        padding: padding,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (iconWidget != null) ...[
              iconWidget,
              SizedBox(height: iconSpacing),
            ],
            Text(
              title,
              textAlign: TextAlign.center,
              style: effectiveTitleStyle,
            ),
            if (message != null && message!.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(
                message!,
                textAlign: TextAlign.center,
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: AppColors.textSecondary,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget? _buildIcon() {
    if (icon == null) return null;
    if (!framedIcon) {
      return Icon(icon, color: AppColors.accent, size: iconSize);
    }

    return Container(
      width: _kFramedIconBoxSize,
      height: _kFramedIconBoxSize,
      decoration: BoxDecoration(
        color: AppColors.surfaceElevated,
        borderRadius: BorderRadius.circular(_kFramedIconBoxRadius),
        border: Border.all(color: AppColors.divider),
      ),
      child: Icon(icon, color: AppColors.accent, size: iconSize),
    );
  }
}
