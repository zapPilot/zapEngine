import 'package:ai_podcast_mobile/models/episode_page.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('EpisodePage.fromJson maps items and nextCursor', () {
    final page = EpisodePage.fromJson({
      'items': [
        {
          'id': 'uuid-123',
          'title': 'Test Episode',
          'hlsUrl': 'https://cdn.example.com/playlist.m3u8',
          'createdAt': '2024-01-01T12:00:00.000Z',
          'listened': false,
          'script': null,
        },
      ],
      'nextCursor': 'cursor-1',
    });

    expect(page.items, hasLength(1));
    expect(page.items.single.id, 'uuid-123');
    expect(page.nextCursor, 'cursor-1');
  });
}
