import 'package:flutter/material.dart';
import 'package:zapengine_tokens/design_tokens.dart';

import '../../config/language_codes.dart';
import '../../models/episode.dart';
import '../../theme/colors.dart';
import '../synced_transcript.dart';

class EpisodeDetailTranscriptSection extends StatelessWidget {
  const EpisodeDetailTranscriptSection({super.key, required this.episode});

  final Episode episode;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _LanguageClassroomSection(episode: episode),
        if (episode.languageClassrooms.isNotEmpty) const SizedBox(height: 28),
        SyncedTranscript(episode: episode),
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
          languageShortLabelFor(languageCode),
          style: Theme.of(context).textTheme.labelMedium?.copyWith(
                color: AppColors.accent,
                fontWeight: FontWeight.w800,
              ),
        ),
      ),
    );
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
