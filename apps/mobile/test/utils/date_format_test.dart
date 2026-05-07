import 'package:ai_podcast_mobile/utils/date_format.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('formatEpisodeDate', () {
    test('formats date with year-month-day and hour:minute', () {
      final date = DateTime(2024, 3, 15, 10, 30);
      expect(formatEpisodeDate(date), '2024-03-15 10:30');
    });

    test('pads single digit month and day with zeros', () {
      final date = DateTime(2024, 1, 5, 8, 5);
      expect(formatEpisodeDate(date), '2024-01-05 08:05');
    });

    test('handles midnight', () {
      final date = DateTime(2024, 12, 31, 0, 0);
      expect(formatEpisodeDate(date), '2024-12-31 00:00');
    });

    test('handles end of day', () {
      final date = DateTime(2024, 6, 15, 23, 59);
      expect(formatEpisodeDate(date), '2024-06-15 23:59');
    });
  });
}
