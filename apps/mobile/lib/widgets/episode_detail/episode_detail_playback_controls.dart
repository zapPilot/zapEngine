import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../models/episode.dart';
import '../../state/playback_provider.dart';
import '../../theme/colors.dart';
import '../../utils/date_format.dart';
import 'episode_detail_audio_track_pill.dart';
import '../language_chip_row.dart';
import '../play_pause_button.dart';
import '../playback_speed_menu.dart';

class EpisodeDetailPlaybackControls extends StatefulWidget {
  const EpisodeDetailPlaybackControls({
    super.key,
    required this.episode,
    required this.onLanguageSelected,
  });

  final Episode episode;
  final ValueChanged<String> onLanguageSelected;

  @override
  State<EpisodeDetailPlaybackControls> createState() =>
      _EpisodeDetailPlaybackControlsState();
}

class _EpisodeDetailPlaybackControlsState
    extends State<EpisodeDetailPlaybackControls> {
  double? _scrubValue;
  bool _pressed = false;

  Future<void> _togglePlayback() async {
    setState(() => _pressed = true);
    await Future<void>.delayed(const Duration(milliseconds: 80));
    if (mounted) {
      setState(() => _pressed = false);
    }
    if (!mounted) return;
    await context.read<PlaybackProvider>().toggle(widget.episode);
  }

  @override
  Widget build(BuildContext context) {
    final playback = context.watch<PlaybackProvider>();
    final currentEpisode = playback.currentEpisode;
    final isCurrent = currentEpisode != null &&
        currentEpisode.isSameLocalizationAs(widget.episode);
    final isPlaying = isCurrent && playback.isPlaying;
    final isLoading = playback.loadingEpisodeId == widget.episode.id;
    final position = isCurrent ? playback.position : Duration.zero;
    final duration = isCurrent ? playback.duration : Duration.zero;
    final durationMs = duration.inMilliseconds;
    final maxValue = durationMs > 0 ? durationMs.toDouble() : 1.0;
    final liveValue = durationMs > 0
        ? position.inMilliseconds.clamp(0, durationMs).toDouble()
        : 0.0;
    final sliderValue = (_scrubValue ?? liveValue).clamp(0.0, maxValue);
    final displayedPosition = Duration(milliseconds: sliderValue.round());
    final audioTracks = widget.episode.playableAudioTracks;
    final selectedLanguageCode = widget.episode.languageCode;
    final selectedAudioTrack = isCurrent && playback.currentAudioTrack != null
        ? playback.currentAudioTrack
        : audioTracks.isNotEmpty
            ? audioTracks.first
            : null;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          SizedBox(
            height: 56,
            child: Row(
              children: [
                AnimatedScale(
                  scale: _pressed ? 0.96 : 1,
                  duration: const Duration(milliseconds: 90),
                  curve: Curves.easeOutCubic,
                  child: PlayPauseButton(
                    isPlaying: isPlaying,
                    isLoading: isLoading,
                    onPressed: _togglePlayback,
                    fixedSize: const Size.square(52),
                    iconSize: 28,
                    spinnerSize: 20,
                  ),
                ),
                const SizedBox(width: 12),
                Text(
                  formatDuration(displayedPosition),
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: AppColors.textPrimary,
                      ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: SliderTheme(
                    data: SliderTheme.of(context).copyWith(
                      activeTrackColor: AppColors.accent,
                      inactiveTrackColor: AppColors.divider,
                      thumbColor: AppColors.accent,
                      overlayColor: AppColors.accent.withValues(alpha: 0.16),
                      trackHeight: 4,
                      thumbShape: const RoundSliderThumbShape(
                        enabledThumbRadius: 6,
                      ),
                    ),
                    child: Slider(
                      value: sliderValue,
                      min: 0,
                      max: maxValue,
                      onChangeStart: durationMs > 0 && isCurrent
                          ? (value) => setState(() => _scrubValue = value)
                          : null,
                      onChanged: durationMs > 0 && isCurrent
                          ? (value) => setState(() => _scrubValue = value)
                          : null,
                      onChangeEnd: durationMs > 0 && isCurrent
                          ? (value) async {
                              setState(() => _scrubValue = null);
                              await context.read<PlaybackProvider>().seek(
                                    Duration(milliseconds: value.round()),
                                  );
                            }
                          : null,
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Text(
                  formatDuration(duration),
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ),
          ),
          const SizedBox(height: 8),
          Align(
            alignment: Alignment.centerRight,
            child: PlaybackSpeedMenu(
              speed: playback.currentSectionSpeed,
              onSelected: playback.setSpeedForCurrentSection,
            ),
          ),
          if (audioTracks.length > 1) ...[
            const SizedBox(height: 10),
            EpisodeDetailAudioTrackPill(
              tracks: audioTracks,
              selectedTrack: selectedAudioTrack,
              enabled: isCurrent,
              onSelected: playback.setAudioTrack,
            ),
          ] else ...[
            const SizedBox(height: 10),
            LanguageChipRow(
              currentCode: selectedLanguageCode,
              onSelected: widget.onLanguageSelected,
            ),
          ],
        ],
      ),
    );
  }
}
