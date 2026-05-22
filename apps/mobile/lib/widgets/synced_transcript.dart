import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/episode.dart';
import '../state/playback_provider.dart';
import '../theme/colors.dart';
import '../utils/date_format.dart';
import '../utils/transcript_timing.dart';

class SyncedTranscript extends StatefulWidget {
  const SyncedTranscript({super.key, required this.episode});

  final Episode episode;

  @override
  State<SyncedTranscript> createState() => _SyncedTranscriptState();
}

class _SyncedTranscriptState extends State<SyncedTranscript> {
  String? _segmentEpisodeId;
  String? _segmentScript;
  Duration? _segmentDuration;
  List<TranscriptSegment> _segments = const [];
  List<GlobalKey> _rowKeys = const [];
  int? _lastScrolledIndex;

  @override
  Widget build(BuildContext context) {
    final playback = context.watch<PlaybackProvider>();
    final isCurrentEpisode = playback.currentEpisode?.id == widget.episode.id;
    final duration = isCurrentEpisode ? playback.duration : Duration.zero;
    final position = isCurrentEpisode ? playback.position : Duration.zero;
    final segments = _segmentsFor(duration);
    final canSync = isCurrentEpisode && duration > Duration.zero;
    final currentIndex =
        canSync ? _currentSegmentIndex(segments, position) : -1;

    if (currentIndex >= 0 && currentIndex != _lastScrolledIndex) {
      _lastScrolledIndex = currentIndex;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        final rowContext = _rowKeys[currentIndex].currentContext;
        if (rowContext == null) return;

        Scrollable.ensureVisible(
          rowContext,
          duration: const Duration(milliseconds: 180),
          curve: Curves.easeOutCubic,
          alignment: 0.45,
        );
      });
    }

    return SelectionArea(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Text(
              'Transcript',
              style: Theme.of(context).textTheme.titleMedium,
            ),
          ),
          const SizedBox(height: 12),
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: 16),
            child: Divider(height: 1),
          ),
          if (segments.isEmpty || !canSync)
            _PlainTranscript(script: widget.episode.script)
          else
            ListView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
              itemCount: segments.length,
              itemBuilder: (context, index) {
                final segment = segments[index];
                return _TranscriptLine(
                  key: _rowKeys[index],
                  segment: segment,
                  state: _lineState(index, currentIndex),
                  onTap: () => _seekToSegment(context, segment),
                );
              },
            ),
        ],
      ),
    );
  }

  List<TranscriptSegment> _segmentsFor(Duration duration) {
    final script = widget.episode.script;
    if (_segmentEpisodeId == widget.episode.id &&
        _segmentScript == script &&
        _segmentDuration == duration) {
      return _segments;
    }

    _segmentEpisodeId = widget.episode.id;
    _segmentScript = script;
    _segmentDuration = duration;
    _segments = estimateTranscriptTiming(script, duration);
    _rowKeys = [for (final _ in _segments) GlobalKey()];
    _lastScrolledIndex = null;
    return _segments;
  }

  int _currentSegmentIndex(
    List<TranscriptSegment> segments,
    Duration position,
  ) {
    if (segments.isEmpty) return -1;
    final index = segments.indexWhere(
      (segment) => position >= segment.start && position < segment.end,
    );
    if (index >= 0) return index;
    return position >= segments.last.start ? segments.length - 1 : 0;
  }

  _TranscriptLineState _lineState(int index, int currentIndex) {
    if (index == currentIndex) return _TranscriptLineState.current;
    if (index < currentIndex) return _TranscriptLineState.past;
    return _TranscriptLineState.future;
  }

  Future<void> _seekToSegment(
    BuildContext context,
    TranscriptSegment segment,
  ) async {
    final playback = context.read<PlaybackProvider>();
    if (playback.currentEpisode?.id != widget.episode.id) {
      await playback.toggle(widget.episode);
    }
    await playback.seek(segment.start);
  }
}

class _PlainTranscript extends StatelessWidget {
  const _PlainTranscript({required this.script});

  final String? script;

  @override
  Widget build(BuildContext context) {
    final body = script?.trim();

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
      child: Text(
        body?.isNotEmpty == true ? body! : 'No script available yet.',
        style: Theme.of(context).textTheme.bodyMedium?.copyWith(
              color: AppColors.textSecondary,
              height: 1.6,
              letterSpacing: 0,
            ),
      ),
    );
  }
}

enum _TranscriptLineState { past, current, future }

class _TranscriptLine extends StatelessWidget {
  const _TranscriptLine({
    super.key,
    required this.segment,
    required this.state,
    required this.onTap,
  });

  final TranscriptSegment segment;
  final _TranscriptLineState state;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isCurrent = state == _TranscriptLineState.current;
    final textColor =
        isCurrent ? AppColors.textPrimary : AppColors.textSecondary;
    final opacity = state == _TranscriptLineState.past ? 0.42 : 1.0;

    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: InkWell(
        borderRadius: BorderRadius.circular(10),
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 160),
          curve: Curves.easeOutCubic,
          padding: const EdgeInsets.fromLTRB(10, 8, 10, 8),
          decoration: BoxDecoration(
            border: Border(
              left: BorderSide(
                color: isCurrent ? AppColors.accent : Colors.transparent,
                width: 2,
              ),
            ),
          ),
          child: Opacity(
            opacity: opacity,
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SizedBox(
                  width: 42,
                  child: Text(
                    formatDuration(segment.start),
                    style: theme.textTheme.labelSmall?.copyWith(
                      color: isCurrent
                          ? AppColors.accent
                          : AppColors.textSecondary,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 0,
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    segment.text,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: textColor,
                      height: 1.55,
                      fontWeight: isCurrent ? FontWeight.w700 : FontWeight.w400,
                      letterSpacing: 0,
                    ),
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
