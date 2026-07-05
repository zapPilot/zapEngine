import 'package:ai_podcast_mobile/models/episode_search_result.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('parses a title search result with its nested episode', () {
    final result = EpisodeSearchResult.fromJson({
      'episode': {
        'id': 'episode-1',
        'title': 'Treasury liquidity watch',
        'languageCode': 'en',
        'hlsUrl': 'https://cdn.example.com/episode-1.m3u8',
        'createdAt': '2026-06-01T00:00:00.000Z',
        'listened': false,
        'script': 'Liquidity conditions changed.',
      },
      'matchSource': 'title',
      'snippet': 'Liquidity conditions changed.',
    });

    expect(result.episode.id, 'episode-1');
    expect(result.matchSource, EpisodeSearchMatchSource.title);
    expect(result.snippet, 'Liquidity conditions changed.');
  });

  test('parses a script result with a null snippet', () {
    final result = EpisodeSearchResult.fromJson({
      'episode': {
        'id': 'episode-2',
        'title': 'Market notes',
        'hlsUrl': 'https://cdn.example.com/episode-2.m3u8',
        'createdAt': '2026-06-01T00:00:00.000Z',
        'listened': false,
      },
      'matchSource': 'script',
      'snippet': null,
    });

    expect(result.matchSource, EpisodeSearchMatchSource.script);
    expect(result.snippet, isNull);
  });
}
