import 'dart:convert';

import 'package:ai_podcast_mobile/models/episode_search_result.dart';
import 'package:ai_podcast_mobile/services/episode_service.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  test('encodes search parameters and parses results', () async {
    late Uri requestedUri;
    final client = MockClient((request) async {
      requestedUri = request.url;
      return http.Response(
        jsonEncode({
          'items': [
            {
              'episode': {
                'id': 'episode-1',
                'title': 'The Fed balance sheet',
                'languageCode': 'en',
                'hlsUrl': 'https://cdn.example.com/episode-1.m3u8',
                'createdAt': '2026-06-01T00:00:00.000Z',
                'listened': false,
              },
              'matchSource': 'title',
              'snippet': 'Liquidity conditions changed.',
            },
          ],
        }),
        200,
      );
    });
    final service = EpisodeService(httpClient: client);

    final results = await service.searchEpisodes(
      query: ' Fed & liquidity ',
      languageCode: 'en',
      limit: 7,
    );

    expect(requestedUri.path, '/episodes/search');
    expect(requestedUri.queryParameters, {
      'q': 'Fed & liquidity',
      'language': 'en',
      'limit': '7',
    });
    expect(results, hasLength(1));
    expect(results.single.matchSource, EpisodeSearchMatchSource.title);
  });

  test('throws EpisodeServiceException for a failed search request', () async {
    final service = EpisodeService(
      httpClient: MockClient(
        (_) async => http.Response('service unavailable', 503),
      ),
    );

    await expectLater(
      service.searchEpisodes(query: 'liquidity', languageCode: 'en'),
      throwsA(
        isA<EpisodeServiceException>().having(
          (error) => error.message,
          'message',
          contains('503'),
        ),
      ),
    );
  });
}
