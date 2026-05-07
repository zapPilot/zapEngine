import 'package:flutter/material.dart';
import 'package:zapengine_tokens/design_tokens.dart';

import '../models/episode.dart';
import '../theme/colors.dart';
import '../utils/date_format.dart';

class EpisodeHeroFrame extends StatelessWidget {
  const EpisodeHeroFrame({
    super.key,
    required this.child,
    this.height,
    this.constraints,
    this.onTap,
    this.iconRight = -20,
    this.iconTop = 22,
    this.iconSize = 128,
    this.iconOpacity = 0.13,
  });

  final Widget child;
  final double? height;
  final BoxConstraints? constraints;
  final VoidCallback? onTap;
  final double iconRight;
  final double iconTop;
  final double iconSize;
  final double iconOpacity;

  @override
  Widget build(BuildContext context) {
    final content = Stack(
      children: [
        Positioned(
          right: iconRight,
          top: iconTop,
          child: Icon(
            Icons.graphic_eq_rounded,
            size: iconSize,
            color: AppColors.accent.withValues(alpha: iconOpacity),
          ),
        ),
        Padding(padding: const EdgeInsets.all(24), child: child),
      ],
    );

    return Container(
      margin: const EdgeInsets.fromLTRB(16, 8, 16, 28),
      height: height,
      constraints: constraints,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(ZapTokens.radiusControl),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            AppColors.accentMuted,
            AppColors.surfaceElevated,
            AppColors.surface,
          ],
          stops: [0, 0.48, 1],
        ),
        border: Border.all(color: AppColors.dividerStrong),
        boxShadow: [
          BoxShadow(
            color: AppColors.accent.withValues(alpha: 0.12),
            blurRadius: 36,
            offset: const Offset(0, 18),
          ),
        ],
      ),
      child: onTap == null
          ? content
          : Material(
              color: Colors.transparent,
              borderRadius: BorderRadius.circular(ZapTokens.radiusControl),
              child: InkWell(
                borderRadius: BorderRadius.circular(ZapTokens.radiusControl),
                onTap: onTap,
                child: content,
              ),
            ),
    );
  }
}

class EpisodeHeroText extends StatelessWidget {
  const EpisodeHeroText({
    super.key,
    required this.episode,
    this.showDateSeparator = false,
    this.footer,
  });

  final Episode episode;
  final bool showDateSeparator;
  final Widget? footer;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Text(
              'LATEST',
              style: theme.textTheme.bodySmall?.copyWith(
                color: AppColors.accent,
                fontWeight: FontWeight.w800,
              ),
            ),
            if (showDateSeparator) ...[
              const SizedBox(width: 8),
              Text('-', style: theme.textTheme.bodySmall),
            ],
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                formatEpisodeDate(episode.createdAt),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: theme.textTheme.bodySmall,
              ),
            ),
          ],
        ),
        const Spacer(),
        Text(
          episode.title,
          maxLines: 4,
          overflow: TextOverflow.ellipsis,
          style: theme.textTheme.headlineLarge,
        ),
        if (footer != null) ...[const SizedBox(height: 20), footer!],
      ],
    );
  }
}
