import 'package:ai_podcast_mobile/models/episode.dart';
import 'package:ai_podcast_mobile/widgets/feed/feed_screen_sections.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test(
    'groups feed episodes with unread oldest first and completed newest first',
    () {
      final groups = groupFeedEpisodesByStatus([
        _episode('unplayed-new', createdAt: DateTime(2026, 5, 4)),
        _episode(
          'in-progress-b',
          createdAt: DateTime(2026, 5, 2),
          lastPositionSeconds: 30,
        ),
        _episode('completed-old', createdAt: DateTime(2026, 5), listened: true),
        _episode(
          'completed-new-a',
          createdAt: DateTime(2026, 5, 5),
          listened: true,
        ),
        _episode(
          'in-progress-old',
          createdAt: DateTime(2026, 5),
          lastPositionSeconds: 30,
        ),
        _episode(
          'completed-new-b',
          createdAt: DateTime(2026, 5, 5),
          listened: true,
        ),
        _episode('unplayed-old', createdAt: DateTime(2026, 5)),
        _episode(
          'in-progress-a',
          createdAt: DateTime(2026, 5, 2),
          lastPositionSeconds: 30,
        ),
      ]);

      expect(groups.inProgress.map((episode) => episode.id), [
        'in-progress-old',
        'in-progress-a',
        'in-progress-b',
      ]);
      expect(groups.unplayed.map((episode) => episode.id), [
        'unplayed-old',
        'unplayed-new',
      ]);
      expect(groups.completed.map((episode) => episode.id), [
        'completed-new-b',
        'completed-new-a',
        'completed-old',
      ]);
    },
  );

  test('hero selects the oldest in-progress episode first', () {
    final episodes = [
      _episode(
        'in-progress-new',
        createdAt: DateTime(2026, 5, 4),
        lastPositionSeconds: 30,
      ),
      _episode(
        'in-progress-old',
        createdAt: DateTime(2026, 5),
        lastPositionSeconds: 30,
      ),
      _episode('unplayed-old', createdAt: DateTime(2026, 4, 30)),
    ];
    final groups = groupFeedEpisodesByStatus(episodes);

    expect(heroEpisodeForFeed(episodes, groups)?.id, 'in-progress-old');
  });

  test(
    'hero selects the oldest unplayed episode when none are in progress',
    () {
      final episodes = [
        _episode('unplayed-new', createdAt: DateTime(2026, 5, 4)),
        _episode('unplayed-old', createdAt: DateTime(2026, 5)),
      ];
      final groups = groupFeedEpisodesByStatus(episodes);

      expect(heroEpisodeForFeed(episodes, groups)?.id, 'unplayed-old');
    },
  );
}

Episode _episode(
  String id, {
  required DateTime createdAt,
  bool listened = false,
  int lastPositionSeconds = 0,
}) {
  return Episode(
    id: id,
    title: 'Episode $id',
    hlsUrl: 'https://example.com/$id.m3u8',
    createdAt: createdAt,
    listened: listened,
    lastPositionSeconds: lastPositionSeconds,
  );
}
