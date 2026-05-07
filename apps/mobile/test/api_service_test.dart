import 'dart:convert';

import 'package:ai_podcast_mobile/services/api_service.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  test('defaults to the production Fly API base URL', () async {
    late Uri requestedUrl;
    final client = MockClient((request) async {
      requestedUrl = request.url;

      return http.Response(
        jsonEncode({'items': <Map<String, Object?>>[], 'nextCursor': null}),
        200,
      );
    });

    final api = ApiService(client: client);
    await api.getEpisodes();

    expect(
      requestedUrl,
      Uri.parse(
        'https://from-fed-to-chain-api.fly.dev/episodes?limit=20&language=zh-Hant',
      ),
    );
  });
}
