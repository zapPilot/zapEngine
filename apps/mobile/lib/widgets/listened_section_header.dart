import 'package:flutter/material.dart';

import '../theme/colors.dart';

class ListenedSectionHeader extends StatelessWidget {
  const ListenedSectionHeader({
    super.key,
    required this.count,
    required this.expanded,
    required this.onTap,
  });

  final int count;
  final bool expanded;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(8),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 10),
            child: Row(
              children: [
                AnimatedRotation(
                  turns: expanded ? 0.25 : 0,
                  duration: const Duration(milliseconds: 160),
                  child: const Icon(
                    Icons.chevron_right_rounded,
                    color: AppColors.textSecondary,
                  ),
                ),
                const SizedBox(width: 4),
                Text(
                  '已聽完 ($count)',
                  style: Theme.of(
                    context,
                  ).textTheme.titleMedium?.copyWith(fontSize: 17),
                ),
                const SizedBox(width: 12),
                const Expanded(child: Divider()),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
