import 'package:ai_podcast_mobile/config/app_config.dart';
import 'package:ai_podcast_mobile/models/episode.dart';
import 'package:ai_podcast_mobile/models/episode_page.dart';
import 'package:ai_podcast_mobile/screens/episode_detail_screen.dart';
import 'package:ai_podcast_mobile/screens/feed_screen.dart';
import 'package:ai_podcast_mobile/services/auth_service.dart';
import 'package:ai_podcast_mobile/services/episode_service.dart';
import 'package:ai_podcast_mobile/services/likes_service.dart';
import 'package:ai_podcast_mobile/state/auth_provider.dart';
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

  testWidgets('unplayed episode list play button is disabled', (tester) async {
    final handler = FakePodcastAudioHandler();
    final service = _FeedEpisodeService();

    await _pumpFeed(tester, service, audioHandler: handler);

    final disabledPlayButton = find.descendant(
      of: find.byType(EpisodeCard),
      matching: find.byTooltip('點開 episode 才能開始播放'),
    );
    expect(disabledPlayButton, findsOneWidget);

    await tester.tap(disabledPlayButton, warnIfMissed: false);
    await tester.pump();

    expect(handler.loadedEpisodeIds, isEmpty);
    expect(handler.playCount, 0);
    expect(find.byType(EpisodeDetailScreen), findsNothing);

    await tester.pump(const Duration(seconds: 2));
    await tester.tap(
      find.descendant(
        of: find.byType(EpisodeCard),
        matching: find.text('Treasury liquidity watch'),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.byType(EpisodeDetailScreen), findsOneWidget);

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
}

Future<void> _pumpFeed(
  WidgetTester tester,
  _FeedEpisodeService episodeService, {
  FakePodcastAudioHandler? audioHandler,
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
  _FeedEpisodeService({this.states = const {}, this.stateError});

  final Map<String, UserEpisodeState> states;
  final Object? stateError;
  int userStateRequests = 0;

  @override
  Future<EpisodePage> getEpisodes({
    int limit = 20,
    String? cursor,
    String languageCode = AppConfig.contentLanguageCode,
  }) async {
    return EpisodePage(
      items: [
        Episode(
          id: 'episode-1',
          title: 'Treasury liquidity watch',
          hlsUrl: 'https://cdn.example.com/episode-1.m3u8',
          createdAt: DateTime(2026, 5, 4),
          listened: false,
        ),
      ],
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
  }) async {}

  @override
  Future<void> setPosition({
    required String userId,
    required String episodeId,
    required int seconds,
  }) async {}
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
