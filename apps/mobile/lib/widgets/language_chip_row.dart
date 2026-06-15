import 'package:flutter/material.dart';
import 'package:zapengine_tokens/design_tokens.dart';

import '../config/language_codes.dart';
import '../theme/colors.dart';
import '../utils/snackbar.dart';

class LanguageChipRow extends StatelessWidget {
  const LanguageChipRow({
    super.key,
    required this.currentCode,
    this.onSelected,
  });

  final String currentCode;
  final ValueChanged<String>? onSelected;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return SizedBox(
      height: 38,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: AppColors.surfaceElevated,
          borderRadius: BorderRadius.circular(19),
          border: Border.all(color: AppColors.divider),
        ),
        child: Padding(
          padding: const EdgeInsets.all(3),
          child: Row(
            children: [
              for (final option in kLanguageOptions)
                Expanded(
                  child: _LanguageChipSegment(
                    option: option,
                    selected: option.code == currentCode,
                    textStyle: theme.textTheme.bodySmall,
                    onSelected: onSelected,
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _LanguageChipSegment extends StatelessWidget {
  const _LanguageChipSegment({
    required this.option,
    required this.selected,
    required this.textStyle,
    required this.onSelected,
  });

  final LanguageOption option;
  final bool selected;
  final TextStyle? textStyle;
  final ValueChanged<String>? onSelected;

  @override
  Widget build(BuildContext context) {
    final enabled = option.enabled;
    final segment = Opacity(
      opacity: enabled ? 1 : 0.5,
      child: InkWell(
        borderRadius: BorderRadius.circular(ZapTokens.radiusControl),
        onTap: () => _handleTap(context),
        child: AnimatedContainer(
          height: double.infinity,
          alignment: Alignment.center,
          duration: const Duration(milliseconds: 160),
          curve: Curves.easeOutCubic,
          decoration: BoxDecoration(
            color: selected ? AppColors.accent : Colors.transparent,
            borderRadius: BorderRadius.circular(ZapTokens.radiusControl),
          ),
          padding: const EdgeInsets.symmetric(horizontal: 8),
          child: FittedBox(
            fit: BoxFit.scaleDown,
            child: Text(
              option.shortLabel,
              maxLines: 1,
              style:
                  textStyle?.copyWith(
                    color: selected
                        ? AppColors.background
                        : AppColors.textSecondary,
                    fontWeight: selected ? FontWeight.w800 : FontWeight.w700,
                  ) ??
                  TextStyle(
                    color: selected
                        ? AppColors.background
                        : AppColors.textSecondary,
                    fontWeight: selected ? FontWeight.w800 : FontWeight.w700,
                  ),
            ),
          ),
        ),
      ),
    );

    if (enabled) return segment;

    return Tooltip(message: kComingSoonTooltip, child: segment);
  }

  void _handleTap(BuildContext context) {
    if (!option.enabled) {
      context.showMessage(kComingSoonTooltip);
      return;
    }
    if (!selected) {
      onSelected?.call(option.code);
    }
  }
}
