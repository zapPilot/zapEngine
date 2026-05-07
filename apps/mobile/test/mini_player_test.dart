import 'package:ai_podcast_mobile/models/episode.dart';
import 'package:ai_podcast_mobile/models/episode_page.dart';
import 'package:ai_podcast_mobile/screens/episode_detail_screen.dart';
import 'package:ai_podcast_mobile/screens/home_shell.dart';
import 'package:ai_podcast_mobile/config/app_config.dart';
import 'package:ai_podcast_mobile/services/episode_service.dart';
import 'package:ai_podcast_mobile/state/auth_provider.dart';
import 'package:ai_podcast_mobile/state/likes_provider.dart';
import 'package:ai_podcast_mobile/state/playback_provider.dart';
import 'package:ai_podcast_mobile/theme/app_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'fakes/fake_podcast_audio_handler.dart';

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  testWidgets('mini player no longer renders a playback-speed control', (
    tester,
  ) async {
    final harness = await _pumpMiniPlayer(tester);

    expect(
      find.text('1.0x'),
      findsNothing,
      reason: 'speed chip must live only on the episode detail screen',
    );
    expect(find.byTooltip('Playback speed'), findsNothing);

    await harness.dispose();
  });

  testWidgets('tapping the mini player bar opens the episode detail screen', (
    tester,
  ) async {
    final harness = await _pumpMiniPlayer(tester);

    expect(find.byType(EpisodeDetailScreen), findsNothing);

    // Tap the title area (not the play button) so we exercise the
    // outer GestureDetector, not the IconButton inside it.
    await tester.tap(find.text('Test episode'));
    await tester.pumpAndSettle();

    expect(find.byType(EpisodeDetailScreen), findsOneWidget);

    await harness.dispose();
  });

  testWidgets(
    'tapping the play button toggles playback and does not navigate away',
    (tester) async {
      final harness = await _pumpMiniPlayer(tester);

      expect(harness.handler.pauseCount, 0);

      await tester.tap(find.byTooltip('Pause'));
      await tester.pumpAndSettle();

      expect(
        harness.handler.pauseCount,
        1,
        reason: 'play/pause button must still work independently',
      );
      expect(
        find.byType(EpisodeDetailScreen),
        findsNothing,
        reason: 'tapping the inner button must not bubble to the bar onTap',
      );

      await harness.dispose();
    },
  );
}

class _Harness {
  _Harness(this.handler, this.provider);
  final FakePodcastAudioHandler handler;
  final PlaybackProvider provider;

  Future<void> dispose() async {
    provider.dispose();
    await handler.dispose();
  }
}

Future<_Harness> _pumpMiniPlayer(WidgetTester tester) async {
  final handler = FakePodcastAudioHandler();
  final provider = PlaybackProvider(handler);
  final episode = Episode(
    id: 'episode-1',
    title: 'Test episode',
    hlsUrl: 'https://example.com/audio.m3u8',
    createdAt: DateTime(2026, 5, 4),
    listened: false,
  );

  await provider.toggle(episode);

  await tester.pumpWidget(
    MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => AuthProvider()),
        ChangeNotifierProvider.value(value: provider),
        ChangeNotifierProvider(create: (_) => LikesProvider()),
      ],
      child: MaterialApp(
        theme: AppTheme.dark(),
        home: HomeShell(episodeService: _EmptyEpisodeService()),
      ),
    ),
  );
  await tester.pumpAndSettle();

  return _Harness(handler, provider);
}

class _EmptyEpisodeService extends EpisodeService {
  @override
  Future<Set<String>> getListenedEpisodeIds(String userId) async => {};

  @override
  Future<Map<String, UserEpisodeState>> getUserState(
    String userId, {
    Iterable<String>? episodeIds,
  }) async {
    return const {};
  }

  @override
  Future<void> setListened({
    required String userId,
    required String episodeId,
    required bool listened,
  }) async {}

  @override
  Future<EpisodePage> getEpisodes({
    int limit = 20,
    String? cursor,
    String languageCode = AppConfig.contentLanguageCode,
  }) async {
    return const EpisodePage(items: [], nextCursor: null);
  }
}
