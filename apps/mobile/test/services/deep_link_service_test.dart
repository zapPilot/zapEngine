import 'package:ai_podcast_mobile/services/deep_link_service.dart';
import 'package:ai_podcast_mobile/models/episode.dart';
import 'package:ai_podcast_mobile/utils/app_logger.dart';
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

    test('ignores the lang query when parsing the episode id', () {
      final id = DeepLinkService.episodeIdFromUri(
        Uri.parse('https://from-fed-to-chain-api.fly.dev/e/abc123?lang=ja'),
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

  group('DeepLinkService.languageCodeFromUri', () {
    test('reads a supported lang query from https links', () {
      final code = DeepLinkService.languageCodeFromUri(
        Uri.parse('https://from-fed-to-chain-api.fly.dev/e/abc123?lang=ja'),
      );

      expect(code, 'ja');
    });

    test('reads a supported lang query from custom scheme links', () {
      final code = DeepLinkService.languageCodeFromUri(
        Uri.parse('fromfedtochain://e/abc123?lang=en'),
      );

      expect(code, 'en');
    });

    test('falls back to the legacy language query parameter', () {
      final code = DeepLinkService.languageCodeFromUri(
        Uri.parse(
          'https://from-fed-to-chain-api.fly.dev/e/abc123?language=zh-Hant',
        ),
      );

      expect(code, 'zh-Hant');
    });

    test('returns null when no language is present', () {
      final code = DeepLinkService.languageCodeFromUri(
        Uri.parse('https://from-fed-to-chain-api.fly.dev/e/abc123'),
      );

      expect(code, isNull);
    });

    test('returns null for unsupported languages', () {
      final code = DeepLinkService.languageCodeFromUri(
        Uri.parse('https://from-fed-to-chain-api.fly.dev/e/abc123?lang=fr'),
      );

      expect(code, isNull);
    });
  });

  testWidgets('loads and pushes the episode detail for supported links', (
    tester,
  ) async {
    final logMessages = <String>[];
    AppLogger.sink = (record) => logMessages.add(record.message);

    try {
      final navigatorKey = GlobalKey<NavigatorState>();
      final service = DeepLinkService(
        navigatorKey: navigatorKey,
        loadEpisode: (id, {languageCode}) async => _episode(id),
        episodeDetailBuilder: (episode) =>
            Scaffold(body: Text('detail:${episode.id}')),
        applyLanguage: (_) async {},
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
        logMessages,
        contains(
          '[DeepLink] openEpisodeUri uri=https://from-fed-to-chain-api.fly.dev/e/episode-42 parsedEpisodeId=episode-42 language=null episodeFound=true navigated=true',
        ),
      );
    } finally {
      AppLogger.sink = null;
    }
  });

  testWidgets('applies the shared language and loads that localization', (
    tester,
  ) async {
    final navigatorKey = GlobalKey<NavigatorState>();
    String? appliedLanguage;
    String? requestedLanguage;

    final service = DeepLinkService(
      navigatorKey: navigatorKey,
      loadEpisode: (id, {languageCode}) async {
        requestedLanguage = languageCode;
        return _episode(id, languageCode: languageCode ?? 'zh-Hant');
      },
      episodeDetailBuilder: (episode) => Scaffold(
        body: Text('detail:${episode.id}:${episode.languageCode}'),
      ),
      applyLanguage: (code) async {
        appliedLanguage = code;
      },
    );

    await tester.pumpWidget(
      MaterialApp(navigatorKey: navigatorKey, home: const SizedBox.shrink()),
    );

    final opened = await service.openEpisodeUri(
      Uri.parse('https://from-fed-to-chain-api.fly.dev/e/episode-42?lang=ja'),
    );
    await tester.pumpAndSettle();

    expect(opened, isTrue);
    expect(appliedLanguage, 'ja');
    expect(requestedLanguage, 'ja');
    expect(find.text('detail:episode-42:ja'), findsOneWidget);
  });
}

Episode _episode(String id, {String languageCode = 'zh-Hant'}) {
  return Episode(
    id: id,
    title: 'Treasury liquidity watch',
    languageCode: languageCode,
    hlsUrl: 'https://cdn.example.com/$id.m3u8',
    createdAt: DateTime(2026, 5, 10),
    listened: false,
  );
}
