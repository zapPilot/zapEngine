import 'package:flutter/material.dart';

import '../theme/colors.dart';

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
              style: titleStyle ?? Theme.of(context).textTheme.titleMedium,
            ),
            if (message != null && message!.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(
                message!,
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
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
      width: 76,
      height: 76,
      decoration: BoxDecoration(
        color: AppColors.surfaceElevated,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppColors.divider),
      ),
      child: Icon(icon, color: AppColors.accent, size: iconSize),
    );
  }
}
