import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:zapengine_tokens/design_tokens.dart';

import '../config/app_config.dart';
import '../models/episode.dart';
import '../state/playback_provider.dart';
import '../theme/colors.dart';
import '../widgets/bookmark_button.dart';
import '../widgets/episode_hero_frame.dart';
import '../widgets/language_chip_row.dart';
import '../widgets/play_pause_button.dart';
import '../widgets/playback_speed_menu.dart';
import '../widgets/share_button.dart';
import '../widgets/synced_transcript.dart';

class EpisodeDetailScreen extends StatefulWidget {
  const EpisodeDetailScreen({super.key, required this.episode});

  final Episode episode;

  @override
  State<EpisodeDetailScreen> createState() => _EpisodeDetailScreenState();
}

class _EpisodeDetailScreenState extends State<EpisodeDetailScreen> {
  late final Episode _episode = widget.episode;
  final ScrollController _scrollController = ScrollController();
  bool _showAppBarBackground = false;
  bool _showBackToTop = false;

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_handleScroll);
  }

  @override
  void dispose() {
    _scrollController
      ..removeListener(_handleScroll)
      ..dispose();
    super.dispose();
  }

  void _handleScroll() {
    final offset = _scrollController.offset;
    final nextShowAppBarBackground = offset > 24;
    final nextShowBackToTop = offset > 400;

    if (nextShowAppBarBackground != _showAppBarBackground ||
        nextShowBackToTop != _showBackToTop) {
      setState(() {
        _showAppBarBackground = nextShowAppBarBackground;
        _showBackToTop = nextShowBackToTop;
      });
    }
  }

  void _scrollToTop() {
    _scrollController.animateTo(
      0,
      duration: const Duration(milliseconds: 320),
      curve: Curves.easeOutCubic,
    );
  }

  @override
  Widget build(BuildContext context) {
    final appBarBackground = _showAppBarBackground
        ? AppColors.background.withValues(alpha: 0.94)
        : Colors.transparent;

    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        backgroundColor: appBarBackground,
        surfaceTintColor: Colors.transparent,
        centerTitle: true,
        leading: IconButton(
          tooltip: 'Back',
          icon: const Icon(Icons.arrow_back_ios_rounded),
          onPressed: () => Navigator.pop(context),
        ),
        title: const Text('From Fed to Chain'),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 8),
            child: ShareButton(episode: _episode, compact: true),
          ),
        ],
      ),
      body: Stack(
        children: [
          SingleChildScrollView(
            controller: _scrollController,
            physics: const BouncingScrollPhysics(),
            child: Padding(
              padding: EdgeInsets.only(
                top: MediaQuery.paddingOf(context).top + kToolbarHeight + 8,
                bottom: MediaQuery.paddingOf(context).bottom + 32,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _EpisodeHeader(episode: _episode),
                  _PlaybackControls(episode: _episode),
                  const SizedBox(height: 14),
                  _ActionRow(episode: _episode),
                  const SizedBox(height: 28),
                  _LanguageClassroomSection(episode: _episode),
                  if (_episode.languageClassrooms.isNotEmpty)
                    const SizedBox(height: 28),
                  SyncedTranscript(episode: _episode),
                ],
              ),
            ),
          ),
          Positioned(
            right: 16,
            bottom: 20,
            child: SafeArea(
              child: IgnorePointer(
                ignoring: !_showBackToTop,
                child: AnimatedOpacity(
                  opacity: _showBackToTop ? 1 : 0,
                  duration: const Duration(milliseconds: 180),
                  child: FloatingActionButton.small(
                    heroTag: 'episode-detail-back-to-top',
                    tooltip: 'Back to top',
                    backgroundColor: AppColors.surfaceElevated,
                    foregroundColor: AppColors.accent,
                    onPressed: _scrollToTop,
                    child: const Icon(Icons.keyboard_arrow_up_rounded),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _EpisodeHeader extends StatelessWidget {
  const _EpisodeHeader({required this.episode});

  final Episode episode;

  @override
  Widget build(BuildContext context) {
    return EpisodeHeroFrame(
      height: 220,
      iconRight: -14,
      iconTop: 24,
      iconSize: 100,
      iconOpacity: 0.10,
      child: EpisodeHeroText(episode: episode, showDateSeparator: true),
    );
  }
}

class _PlaybackControls extends StatefulWidget {
  const _PlaybackControls({required this.episode});

  final Episode episode;

  @override
  State<_PlaybackControls> createState() => _PlaybackControlsState();
}

class _PlaybackControlsState extends State<_PlaybackControls> {
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
    final isCurrent = playback.currentEpisode?.id == widget.episode.id;
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
                  _formatDuration(displayedPosition),
                  style: Theme.of(
                    context,
                  ).textTheme.bodySmall?.copyWith(color: AppColors.textPrimary),
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
                  _formatDuration(duration),
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ),
          ),
          const SizedBox(height: 8),
          Align(
            alignment: Alignment.centerRight,
            child: PlaybackSpeedMenu(
              speed: playback.speed,
              onSelected: playback.setSpeed,
            ),
          ),
          if (audioTracks.length > 1) ...[
            const SizedBox(height: 10),
            _AudioTrackPill(
              tracks: audioTracks,
              selectedTrack: selectedAudioTrack,
              enabled: isCurrent,
              onSelected: playback.setAudioTrack,
            ),
          ] else ...[
            const SizedBox(height: 10),
            const LanguageChipRow(currentCode: AppConfig.contentLanguageCode),
          ],
        ],
      ),
    );
  }

  static String _formatDuration(Duration duration) {
    final totalSeconds = duration.inSeconds;
    final hours = totalSeconds ~/ 3600;
    final minutes = (totalSeconds % 3600) ~/ 60;
    final seconds = totalSeconds % 60;
    String twoDigits(int value) => value.toString().padLeft(2, '0');

    if (hours > 0) {
      return '$hours:${twoDigits(minutes)}:${twoDigits(seconds)}';
    }
    return '$minutes:${twoDigits(seconds)}';
  }
}

class _AudioTrackPill extends StatelessWidget {
  const _AudioTrackPill({
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

class _ActionRow extends StatelessWidget {
  const _ActionRow({required this.episode});

  final Episode episode;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceEvenly,
      children: [
        BookmarkButton(episode: episode),
        ShareButton(episode: episode),
      ],
    );
  }
}

class _LanguageClassroomSection extends StatelessWidget {
  const _LanguageClassroomSection({required this.episode});

  final Episode episode;

  @override
  Widget build(BuildContext context) {
    final lessons = episode.languageClassrooms;
    if (lessons.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Text(
            'Language Classroom',
            style: Theme.of(context).textTheme.titleMedium,
          ),
        ),
        const SizedBox(height: 12),
        for (final lesson in lessons) ...[
          _LanguageClassroomLessonCard(lesson: lesson),
          if (lesson != lessons.last) const SizedBox(height: 12),
        ],
      ],
    );
  }
}

class _LanguageClassroomLessonCard extends StatelessWidget {
  const _LanguageClassroomLessonCard({required this.lesson});

  final LanguageClassroomLesson lesson;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(ZapTokens.radiusCard),
          border: Border.all(color: AppColors.divider),
        ),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  _LanguageBadge(languageCode: lesson.targetLanguageCode),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      lesson.oneLiner,
                      style: theme.textTheme.bodyMedium?.copyWith(
                        color: AppColors.textPrimary,
                        height: 1.45,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final keyword in lesson.keywords)
                    _KeywordChip(keyword: keyword),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _LanguageBadge extends StatelessWidget {
  const _LanguageBadge({required this.languageCode});

  final String languageCode;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: AppColors.accent.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.accent.withValues(alpha: 0.35)),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        child: Text(
          _languageLabel(languageCode),
          style: Theme.of(context).textTheme.labelMedium?.copyWith(
                color: AppColors.accent,
                fontWeight: FontWeight.w800,
              ),
        ),
      ),
    );
  }

  static String _languageLabel(String languageCode) {
    switch (languageCode) {
      case 'ja':
        return 'JP';
      case 'en':
        return 'EN';
      case 'zh-Hant':
        return '繁中';
      default:
        return languageCode;
    }
  }
}

class _KeywordChip extends StatelessWidget {
  const _KeywordChip({required this.keyword});

  final LanguageClassroomKeyword keyword;

  @override
  Widget build(BuildContext context) {
    final reading = keyword.reading?.trim();
    final note = keyword.note?.trim();
    final supporting = [
      if (reading != null && reading.isNotEmpty) reading,
      keyword.meaning,
      if (note != null && note.isNotEmpty) note,
    ].join(' · ');

    return ConstrainedBox(
      constraints: const BoxConstraints(minHeight: 54, maxWidth: 260),
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: AppColors.surfaceElevated,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                keyword.term,
                softWrap: true,
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: AppColors.textPrimary,
                      fontWeight: FontWeight.w800,
                    ),
              ),
              const SizedBox(height: 3),
              Text(
                supporting,
                softWrap: true,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: AppColors.textSecondary,
                      height: 1.25,
                    ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
