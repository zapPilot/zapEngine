import 'package:flutter/material.dart';
import 'package:zapengine_tokens/design_tokens.dart';

import '../../models/episode.dart';
import '../../theme/colors.dart';

class EpisodeDetailAudioTrackPill extends StatelessWidget {
  const EpisodeDetailAudioTrackPill({
    super.key,
    required this.tracks,
    required this.selectedTrack,
    required this.enabled,
    required this.onSelected,
  });

  final List<AudioTrack> tracks;
  final AudioTrack? selectedTrack;
  final bool enabled;
  final ValueChanged<AudioTrack> onSelected;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Opacity(
      opacity: enabled ? 1 : 0.78,
      child: SizedBox(
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
                for (final track in tracks)
                  Expanded(
                    child: _AudioTrackSegment(
                      track: track,
                      selected: track == selectedTrack,
                      enabled: enabled,
                      textStyle: theme.textTheme.bodySmall,
                      onSelected: onSelected,
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _AudioTrackSegment extends StatelessWidget {
  const _AudioTrackSegment({
    required this.track,
    required this.selected,
    required this.enabled,
    required this.textStyle,
    required this.onSelected,
  });

  final AudioTrack track;
  final bool selected;
  final bool enabled;
  final TextStyle? textStyle;
  final ValueChanged<AudioTrack> onSelected;

  @override
  Widget build(BuildContext context) {
    final label = track.title.isNotEmpty ? track.title : track.languageCode;

    return Tooltip(
      message: 'Switch audio to $label',
      child: IgnorePointer(
        ignoring: !enabled,
        child: InkWell(
          borderRadius: BorderRadius.circular(ZapTokens.radiusControl),
          onTap: () => onSelected(track),
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
                label,
                maxLines: 1,
                style: textStyle?.copyWith(
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
      ),
    );
  }
}
