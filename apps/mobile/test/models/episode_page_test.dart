import 'package:ai_podcast_mobile/models/episode_page.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('EpisodePage', () {
    test('fromJson parses items and nextCursor', () {
      final page = EpisodePage.fromJson({
        'items': [
          {
            'id': 'ep-1',
            'title': 'Episode 1',
            'hlsUrl': 'https://example.com/1.m3u8',
            'createdAt': '2024-01-01T00:00:00Z',
            'listened': false,
          },
          {
            'id': 'ep-2',
            'title': 'Episode 2',
            'hlsUrl': 'https://example.com/2.m3u8',
            'createdAt': '2024-01-02T00:00:00Z',
            'listened': true,
          },
        ],
        'nextCursor': 'abc123',
      });

      expect(page.items.length, 2);
      expect(page.items[0].id, 'ep-1');
      expect(page.items[1].id, 'ep-2');
      expect(page.nextCursor, 'abc123');
    });

    test('fromJson handles null nextCursor', () {
      final page = EpisodePage.fromJson({
        'items': <Map<String, dynamic>>[],
        'nextCursor': null,
      });

      expect(page.items, isEmpty);
      expect(page.nextCursor, isNull);
    });

    test('fromJson handles empty items list', () {
      final page = EpisodePage.fromJson({
        'items': <Map<String, dynamic>>[],
        'nextCursor': null,
      });

      expect(page.items, isEmpty);
      expect(page.nextCursor, isNull);
    });

    test('fromJson parses episode fields from items', () {
      final page = EpisodePage.fromJson({
        'items': [
          {
            'id': 'ep-1',
            'title': 'Test Episode',
            'hlsUrl': 'https://example.com/test.m3u8',
            'createdAt': '2024-03-15T10:30:00Z',
            'listened': false,
            'likeCount': 3,
            'script': 'Test script',
          },
        ],
        'nextCursor': null,
      });

      expect(page.items[0].title, 'Test Episode');
      expect(page.items[0].likeCount, 3);
      expect(page.items[0].script, 'Test script');
    });
  });
}
