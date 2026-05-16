import 'package:ai_podcast_mobile/config/app_config.dart';
import 'package:ai_podcast_mobile/models/episode.dart';
import 'package:ai_podcast_mobile/models/episode_page.dart';
import 'package:ai_podcast_mobile/screens/episode_detail_screen.dart';
import 'package:ai_podcast_mobile/screens/feed_screen.dart';
import 'package:ai_podcast_mobile/services/auth_service.dart';
import 'package:ai_podcast_mobile/services/episode_service.dart';
import 'package:ai_podcast_mobile/services/likes_service.dart';
import 'package:ai_podcast_mobile/state/auth_provider.dart';
import 'package:ai_podcast_mobile/state/content_language_provider.dart';
import 'package:ai_podcast_mobile/state/likes_provider.dart';
import 'package:ai_podcast_mobile/state/playback_provider.dart';
import 'package:ai_podcast_mobile/theme/app_theme.dart';
import 'package:ai_podcast_mobile/widgets/episode_card.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'fakes/fake_podcast_audio_handler.dart';

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  testWidgets('hydrates feed episodes with user playback state', (
    tester,
  ) async {
    final service = _FeedEpisodeService(
      states: const {
        'episode-1': UserEpisodeState(listened: false, lastPositionSeconds: 42),
      },
    );

    await _pumpFeed(tester, service);

    expect(service.userStateRequests, 1);
    expect(find.text('Treasury liquidity watch'), findsWidgets);
    expect(find.text('進行中'), findsOneWidget);
    expect(find.text('未聽'), findsNothing);
  });

  testWidgets('shows feed episodes when user state hydration fails', (
    tester,
  ) async {
    final service = _FeedEpisodeService(
      stateError: Exception('permission denied for user_episode_state'),
    );

    await _pumpFeed(tester, service);

    expect(service.userStateRequests, 1);
    expect(find.text('Treasury liquidity watch'), findsWidgets);
    expect(find.text('未聽'), findsOneWidget);
    expect(find.textContaining('permission denied'), findsNothing);
  });

  testWidgets('unplayed episode list play button starts playback', (
    tester,
  ) async {
    final handler = FakePodcastAudioHandler();
    final service = _FeedEpisodeService();

    await _pumpFeed(tester, service, audioHandler: handler);

    final playButton = find.descendant(
      of: find.byType(EpisodeCard),
      matching: find.byTooltip('Play'),
    );
    expect(playButton, findsOneWidget);

    await tester.tap(playButton);
    await tester.pumpAndSettle();

    expect(handler.loadedEpisodeIds, ['episode-1']);
    expect(handler.playCount, 1);
    expect(find.byType(EpisodeDetailScreen), findsNothing);

    await handler.dispose();
  });

  testWidgets('in-progress episode list play resumes stored position', (
    tester,
  ) async {
    final handler = FakePodcastAudioHandler();
    final service = _FeedEpisodeService(
      states: const {
        'episode-1': UserEpisodeState(listened: false, lastPositionSeconds: 42),
      },
    );

    await _pumpFeed(tester, service, audioHandler: handler);

    final playButton = find.descendant(
      of: find.byType(EpisodeCard),
      matching: find.byTooltip('Play'),
    );
    expect(playButton, findsOneWidget);

    await tester.tap(playButton);
    await tester.pumpAndSettle();

    expect(handler.loadedEpisodeIds, ['episode-1']);
    expect(handler.seekPositions, [const Duration(seconds: 42)]);
    expect(handler.playCount, 1);

    await handler.dispose();
  });

  testWidgets(
    'hero action starts smart playback for an unplayed current episode',
    (tester) async {
      final handler = FakePodcastAudioHandler();
      final episode = _feedEpisode(
        id: 'episode-1',
        title: 'Oldest unplayed episode',
      );
      final service = _FeedEpisodeService(episodes: [episode]);

      await _pumpFeed(tester, service, audioHandler: handler);

      final playback = Provider.of<PlaybackProvider>(
        tester.element(find.byType(FeedScreen)),
        listen: false,
      );
      await playback.toggle(episode);
      await playback.pause();
      await tester.pumpAndSettle();

      expect(find.text('從最舊未聽開始'), findsOneWidget);

      await tester.tap(find.text('從最舊未聽開始'));
      await tester.pumpAndSettle();

      expect(handler.loadedEpisodeIds, ['episode-1', 'episode-1']);
      expect(handler.playCount, 2);

      await handler.dispose();
    },
  );

  testWidgets('completed playback updates the local feed hero', (tester) async {
    final handler = FakePodcastAudioHandler();
    final newest = _feedEpisode(
      id: 'episode-new',
      title: 'Newest liquidity watch',
      createdAt: DateTime(2026, 5, 4),
    );
    final oldest = _feedEpisode(
      id: 'episode-old',
      title: 'Oldest liquidity watch',
      createdAt: DateTime(2026, 5),
    );
    final service = _FeedEpisodeService(episodes: [newest, oldest]);

    await _pumpFeed(tester, service, audioHandler: handler);

    expect(find.text('Oldest liquidity watch'), findsWidgets);

    final playback = Provider.of<PlaybackProvider>(
      tester.element(find.byType(FeedScreen)),
      listen: false,
    );
    await playback.toggle(oldest);
    handler.emitDuration(const Duration(seconds: 600));
    handler.emitPosition(const Duration(seconds: 599));
    await tester.pumpAndSettle();

    expect(service.listenedWrites, [
      const _ListenedWrite('user-1', 'episode-old', true),
    ]);
    expect(find.text('Newest liquidity watch'), findsWidgets);
    expect(find.text('Oldest liquidity watch'), findsNothing);

    await handler.dispose();
  });

  testWidgets('reloads feed episodes when content language changes', (
    tester,
  ) async {
    final languageProvider = ContentLanguageProvider();
    final service = _FeedEpisodeService();

    await _pumpFeed(
      tester,
      service,
      languageProvider: languageProvider,
    );

    await languageProvider.setLanguageCode('en');
    await tester.pumpAndSettle();

    expect(service.requestedLanguageCodes, ['zh-Hant', 'en']);
  });
}

Future<void> _pumpFeed(
  WidgetTester tester,
  _FeedEpisodeService episodeService, {
  FakePodcastAudioHandler? audioHandler,
  ContentLanguageProvider? languageProvider,
}) async {
  final authProvider = AuthProvider(
    authService: _FakeAuthService(
      const PodcastUser(id: 'user-1', displayName: 'Test User'),
    ),
  );
  await authProvider.restore();
  final handler = audioHandler ?? FakePodcastAudioHandler();

  await tester.pumpWidget(
    MultiProvider(
      providers: [
        ChangeNotifierProvider<AuthProvider>.value(value: authProvider),
        ChangeNotifierProvider<ContentLanguageProvider>.value(
          value: languageProvider ?? ContentLanguageProvider(),
        ),
        ChangeNotifierProvider(
          create: (_) =>
              PlaybackProvider(handler, episodeService: episodeService),
        ),
        ChangeNotifierProvider(
          create: (_) => LikesProvider(likesService: _EmptyLikesService()),
        ),
      ],
      child: MaterialApp(
        theme: AppTheme.dark(),
        home: FeedScreen(episodeService: episodeService),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

class _FeedEpisodeService extends EpisodeService {
  _FeedEpisodeService({
    List<Episode>? episodes,
    this.states = const {},
    this.stateError,
  }) : episodes = episodes ??
            [
              _feedEpisode(
                id: 'episode-1',
                title: 'Treasury liquidity watch',
              ),
            ];

  final List<Episode> episodes;
  final Map<String, UserEpisodeState> states;
  final Object? stateError;
  final List<_ListenedWrite> listenedWrites = [];
  final List<String> requestedLanguageCodes = [];
  int userStateRequests = 0;

  @override
  Future<EpisodePage> getEpisodes({
    int limit = 20,
    String? cursor,
    String languageCode = AppConfig.contentLanguageCode,
  }) async {
    requestedLanguageCodes.add(languageCode);
    return EpisodePage(
      items: episodes,
      nextCursor: null,
    );
  }

  @override
  Future<Map<String, UserEpisodeState>> getUserState(
    String userId, {
    Iterable<String>? episodeIds,
  }) async {
    userStateRequests += 1;
    final error = stateError;
    if (error != null) {
      throw error;
    }
    return states;
  }

  @override
  Future<void> setListened({
    required String userId,
    required String episodeId,
    required bool listened,
  }) async {
    listenedWrites.add(_ListenedWrite(userId, episodeId, listened));
  }

  @override
  Future<void> setPosition({
    required String userId,
    required String episodeId,
    required int seconds,
  }) async {}
}

Episode _feedEpisode({
  required String id,
  required String title,
  DateTime? createdAt,
}) {
  return Episode(
    id: id,
    title: title,
    hlsUrl: 'https://cdn.example.com/$id.m3u8',
    createdAt: createdAt ?? DateTime(2026, 5, 4),
    listened: false,
  );
}

class _FakeAuthService extends AuthService {
  _FakeAuthService(this.user);

  final PodcastUser user;

  @override
  Future<PodcastUser?> restoreUser() async => user;

  @override
  Future<bool> canUseBiometrics() async => false;
}

class _EmptyLikesService extends LikesService {
  @override
  Stream<LikeSnapshot> streamLikeSnapshot(String userId) {
    return const Stream.empty();
  }
}

class _ListenedWrite {
  const _ListenedWrite(this.userId, this.episodeId, this.listened);

  final String userId;
  final String episodeId;
  final bool listened;

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        other is _ListenedWrite &&
            other.userId == userId &&
            other.episodeId == episodeId &&
            other.listened == listened;
  }

  @override
  int get hashCode => Object.hash(userId, episodeId, listened);

  @override
  String toString() => 'ListenedWrite($userId, $episodeId, $listened)';
}
