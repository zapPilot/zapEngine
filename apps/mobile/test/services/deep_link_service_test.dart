import 'package:ai_podcast_mobile/services/deep_link_service.dart';
import 'package:ai_podcast_mobile/models/episode.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('DeepLinkService.episodeIdFromUri', () {
    test('returns the episode id for production /e/:id links', () {
      final id = DeepLinkService.episodeIdFromUri(
        Uri.parse('https://from-fed-to-chain-api.fly.dev/e/abc123'),
      );

      expect(id, 'abc123');
    });

    test('returns the episode id for custom scheme /e/:id links', () {
      final id = DeepLinkService.episodeIdFromUri(
        Uri.parse('fromfedtochain://e/abc123'),
      );

      expect(id, 'abc123');
    });

    test('returns the episode id for legacy custom scheme audio links', () {
      final id = DeepLinkService.episodeIdFromUri(
        Uri.parse('fromfedtochain://audio/abc123'),
      );

      expect(id, 'abc123');
    });

    test('returns null for unsupported hosts', () {
      final id = DeepLinkService.episodeIdFromUri(
        Uri.parse('https://example.com/e/abc123'),
      );

      expect(id, isNull);
    });

    test('returns null for unsupported paths', () {
      final id = DeepLinkService.episodeIdFromUri(
        Uri.parse('https://from-fed-to-chain-api.fly.dev/episodes/abc123'),
      );

      expect(id, isNull);
    });

    test('returns null for legacy audio paths on the production host', () {
      final id = DeepLinkService.episodeIdFromUri(
        Uri.parse('https://from-fed-to-chain-api.fly.dev/audio/abc123'),
      );

      expect(id, isNull);
    });
  });

  testWidgets('loads and pushes the episode detail for supported links', (
    tester,
  ) async {
    final debugMessages = <String>[];
    final originalDebugPrint = debugPrint;
    debugPrint = (message, {wrapWidth}) {
      if (message != null) {
        debugMessages.add(message);
      }
    };

    try {
      final navigatorKey = GlobalKey<NavigatorState>();
      final service = DeepLinkService(
        navigatorKey: navigatorKey,
        loadEpisode: (id) async => _episode(id),
        episodeDetailBuilder: (episode) =>
            Scaffold(body: Text('detail:${episode.id}')),
      );

      await tester.pumpWidget(
        MaterialApp(navigatorKey: navigatorKey, home: const SizedBox.shrink()),
      );

      final opened = await service.openEpisodeUri(
        Uri.parse('https://from-fed-to-chain-api.fly.dev/e/episode-42'),
      );
      await tester.pumpAndSettle();

      expect(opened, isTrue);
      expect(find.text('detail:episode-42'), findsOneWidget);
      expect(
        debugMessages,
        contains(
          '[DeepLink] openEpisodeUri uri=https://from-fed-to-chain-api.fly.dev/e/episode-42 parsedEpisodeId=episode-42 episodeFound=true navigated=true',
        ),
      );
    } finally {
      debugPrint = originalDebugPrint;
    }
  });
}

Episode _episode(String id) {
  return Episode(
    id: id,
    title: 'Treasury liquidity watch',
    hlsUrl: 'https://cdn.example.com/$id.m3u8',
    createdAt: DateTime(2026, 5, 10),
    listened: false,
  );
}
