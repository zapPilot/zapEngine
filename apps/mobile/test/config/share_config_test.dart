import 'package:ai_podcast_mobile/config/share_config.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('ShareConfig.episodeUri', () {
    test('builds the canonical episode path without a language', () {
      final uri = ShareConfig.episodeUri('abc123');

      expect(uri.scheme, 'https');
      expect(uri.host, 'from-fed-to-chain-api.fly.dev');
      expect(uri.pathSegments, ['e', 'abc123']);
      expect(uri.queryParameters, isEmpty);
    });

    test('appends the language as a lang query parameter', () {
      final uri = ShareConfig.episodeUri('abc123', languageCode: 'ja');

      expect(uri.pathSegments, ['e', 'abc123']);
      expect(uri.queryParameters['lang'], 'ja');
      expect(uri.toString(), contains('/e/abc123?lang=ja'));
    });

    test('omits the query when the language is blank', () {
      final uri = ShareConfig.episodeUri('abc123', languageCode: '   ');

      expect(uri.queryParameters, isEmpty);
    });
  });
}
