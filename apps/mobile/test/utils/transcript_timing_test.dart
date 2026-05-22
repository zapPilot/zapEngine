import 'package:ai_podcast_mobile/utils/transcript_timing.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('estimateTranscriptTiming', () {
    test('returns no segments for null or blank scripts', () {
      expect(
        estimateTranscriptTiming(null, const Duration(minutes: 1)),
        isEmpty,
      );
      expect(estimateTranscriptTiming('', const Duration(minutes: 1)), isEmpty);
      expect(
        estimateTranscriptTiming('   \n  ', const Duration(minutes: 1)),
        isEmpty,
      );
    });

    test('splits equal-length paragraphs into equal durations', () {
      final segments = estimateTranscriptTiming(
        'aaaa\n\nbbbb',
        const Duration(seconds: 100),
      );

      expect(segments, hasLength(2));
      expect(segments[0].text, 'aaaa');
      expect(segments[0].start, Duration.zero);
      expect(segments[0].end, const Duration(seconds: 50));
      expect(segments[1].text, 'bbbb');
      expect(segments[1].start, const Duration(seconds: 50));
      expect(segments[1].end, const Duration(seconds: 100));
    });

    test('uses sentence punctuation when there is only one paragraph', () {
      final segments = estimateTranscriptTiming(
        '第一句。第二句！第三句?',
        const Duration(seconds: 90),
      );

      expect(segments.map((segment) => segment.text), ['第一句。', '第二句！', '第三句?']);
      expect(segments.first.start, Duration.zero);
      expect(segments.last.end, const Duration(seconds: 90));
    });

    test('keeps every segment at zero when duration is zero', () {
      final segments = estimateTranscriptTiming('aaaa\n\nbbbb', Duration.zero);

      expect(segments, hasLength(2));
      for (final segment in segments) {
        expect(segment.start, Duration.zero);
        expect(segment.end, Duration.zero);
      }
    });

    test('allocates the full duration without gaps', () {
      final segments = estimateTranscriptTiming(
        'short\n\nmuch longer line',
        const Duration(seconds: 12),
      );

      expect(segments.first.start, Duration.zero);
      expect(segments.first.end, segments.last.start);
      expect(segments.last.end, const Duration(seconds: 12));
      expect(
        segments.last.end - segments.first.start,
        const Duration(seconds: 12),
      );
    });
  });
}
