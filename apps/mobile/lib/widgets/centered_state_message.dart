import 'package:flutter/material.dart';

import '../theme/colors.dart';

class CenteredStateMessage extends StatelessWidget {
  const CenteredStateMessage({
    super.key,
    required this.title,
    this.message,
    this.icon,
    this.iconSize = 42,
    this.iconSpacing = 16,
    this.padding = const EdgeInsets.all(24),
    this.titleStyle,
  });

  final String title;
  final String? message;
  final IconData? icon;
  final double iconSize;
  final double iconSpacing;
  final EdgeInsetsGeometry padding;
  final TextStyle? titleStyle;

  @override
  Widget build(BuildContext context) {
    final iconWidget = _buildIcon();
    final theme = Theme.of(context);
    final effectiveTitleStyle = titleStyle ?? theme.textTheme.titleMedium;

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
    return Icon(icon, color: AppColors.accent, size: iconSize);
  }
}
