import 'dart:async';

import 'package:ai_podcast_mobile/config/app_config.dart';
import 'package:ai_podcast_mobile/models/episode.dart';
import 'package:ai_podcast_mobile/models/episode_page.dart';
import 'package:ai_podcast_mobile/screens/favorites_screen.dart';
import 'package:ai_podcast_mobile/services/auth_service.dart';
import 'package:ai_podcast_mobile/services/episode_service.dart';
import 'package:ai_podcast_mobile/services/likes_service.dart';
import 'package:ai_podcast_mobile/state/auth_provider.dart';
import 'package:ai_podcast_mobile/state/content_language_provider.dart';
import 'package:ai_podcast_mobile/state/likes_provider.dart';
import 'package:ai_podcast_mobile/state/playback_provider.dart';
import 'package:ai_podcast_mobile/theme/app_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../fakes/fake_podcast_audio_handler.dart';

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  testWidgets('shows liked episodes sorted by episode creation time', (
    tester,
  ) async {
    final episodeService = _FavoritesEpisodeService(
      pages: [
        [
          _episode(
            id: 'episode-new',
            title: 'Newest favorite',
            createdAt: DateTime(2026, 5, 4),
          ),
          _episode(
            id: 'episode-skip',
            title: 'Not favorited',
            createdAt: DateTime(2026, 5, 3),
          ),
        ],
        [
          _episode(
            id: 'episode-old',
            title: 'Older favorite',
            createdAt: DateTime(2026, 5, 1),
          ),
        ],
      ],
    );
    final likesService = _FavoritesLikesService();

    await _pumpFavorites(tester, episodeService, likesService);
    likesService.addSnapshot(
      const LikeSnapshot(
        likedEpisodeIds: {'episode-new', 'episode-old'},
        counts: {'episode-new': 1, 'episode-old': 1},
      ),
    );
    await tester.pumpAndSettle();

    expect(episodeService.requestedCursors, [null, '1']);
    expect(find.text('Newest favorite'), findsWidgets);
    expect(find.text('Older favorite'), findsWidgets);
    expect(find.text('Not favorited'), findsNothing);
    expect(
      tester.getTopLeft(find.text('Newest favorite').first).dy,
      lessThan(tester.getTopLeft(find.text('Older favorite').first).dy),
    );
  });

  testWidgets('swiping a favorite removes the like-backed bookmark', (
    tester,
  ) async {
    final episodeService = _FavoritesEpisodeService(
      pages: [
        [
          _episode(
            id: 'episode-old',
            title: 'Older favorite',
            createdAt: DateTime(2026, 5, 1),
          ),
        ],
      ],
    );
    final likesService = _FavoritesLikesService();

    await _pumpFavorites(tester, episodeService, likesService);
    likesService.addSnapshot(
      const LikeSnapshot(
        likedEpisodeIds: {'episode-old'},
        counts: {'episode-old': 1},
      ),
    );
    await tester.pumpAndSettle();

    await tester.timedDrag(
      find.byKey(const ValueKey('favorite-episode-old')),
      const Offset(-500, 0),
      const Duration(milliseconds: 200),
    );
    await tester.pump();

    expect(
      find.byIcon(Icons.delete_outline_rounded, skipOffstage: false),
      findsOneWidget,
    );

    await tester.pumpAndSettle();

    expect(likesService.toggles, [
      const _ToggleLike(
        userId: 'user-1',
        episodeId: 'episode-old',
        currentlyLiked: true,
      ),
    ]);
    expect(find.text('Older favorite'), findsNothing);
  });

  testWidgets('overflow menu can remove a favorite', (tester) async {
    final episodeService = _FavoritesEpisodeService(
      pages: [
        [
          _episode(
            id: 'episode-menu',
            title: 'Menu favorite',
            createdAt: DateTime(2026, 5, 2),
          ),
        ],
      ],
    );
    final likesService = _FavoritesLikesService();

    await _pumpFavorites(tester, episodeService, likesService);
    likesService.addSnapshot(
      const LikeSnapshot(
        likedEpisodeIds: {'episode-menu'},
        counts: {'episode-menu': 1},
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byTooltip('More options'));
    await tester.pumpAndSettle();

    expect(find.text('Share'), findsOneWidget);
    expect(find.text('從收藏移除'), findsOneWidget);

    await tester.tap(find.text('從收藏移除'));
    await tester.pumpAndSettle();

    expect(likesService.toggles, [
      const _ToggleLike(
        userId: 'user-1',
        episodeId: 'episode-menu',
        currentlyLiked: true,
      ),
    ]);
    expect(find.text('Menu favorite'), findsNothing);
  });

  testWidgets('reloads favorite source episodes when content language changes',
      (
    tester,
  ) async {
    final languageProvider = ContentLanguageProvider();
    final episodeService = _FavoritesEpisodeService(
      pages: [
        [
          _episode(
            id: 'episode-old',
            title: 'Older favorite',
            createdAt: DateTime(2026, 5, 1),
          ),
        ],
      ],
    );
    final likesService = _FavoritesLikesService();

    await _pumpFavorites(
      tester,
      episodeService,
      likesService,
      languageProvider: languageProvider,
    );

    await languageProvider.setLanguageCode('ja');
    await tester.pumpAndSettle();

    expect(episodeService.requestedLanguageCodes, ['zh-Hant', 'ja']);
  });
}

Future<void> _pumpFavorites(
  WidgetTester tester,
  _FavoritesEpisodeService episodeService,
  _FavoritesLikesService likesService, {
  ContentLanguageProvider? languageProvider,
}) async {
  final authProvider = AuthProvider(
    authService: _FakeAuthService(
      const PodcastUser(id: 'user-1', displayName: 'Test User'),
    ),
  );
  await authProvider.restore();
  final handler = FakePodcastAudioHandler();

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
          create: (_) => LikesProvider(likesService: likesService),
        ),
      ],
      child: MaterialApp(
        theme: AppTheme.dark(),
        home: FavoritesScreen(episodeService: episodeService),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

Episode _episode({
  required String id,
  required String title,
  required DateTime createdAt,
}) {
  return Episode(
    id: id,
    title: title,
    hlsUrl: 'https://cdn.example.com/$id.m3u8',
    createdAt: createdAt,
    listened: false,
  );
}

class _FavoritesEpisodeService extends EpisodeService {
  _FavoritesEpisodeService({required this.pages});

  final List<List<Episode>> pages;
  final List<String?> requestedCursors = [];
  final List<String> requestedLanguageCodes = [];

  @override
  Future<EpisodePage> getEpisodes({
    int limit = 20,
    String? cursor,
    String languageCode = AppConfig.contentLanguageCode,
  }) async {
    requestedCursors.add(cursor);
    requestedLanguageCodes.add(languageCode);
    final pageIndex = int.tryParse(cursor ?? '') ?? 0;
    return EpisodePage(
      items: pages[pageIndex],
      nextCursor: pageIndex + 1 < pages.length ? '${pageIndex + 1}' : null,
    );
  }

  @override
  Future<Map<String, UserEpisodeState>> getUserState(
    String userId, {
    Iterable<String>? episodeIds,
  }) async {
    return const {};
  }
}

class _FakeAuthService extends AuthService {
  _FakeAuthService(this.user);

  final PodcastUser user;

  @override
  Future<PodcastUser?> restoreUser() async => user;

  @override
  Future<bool> canUseBiometrics() async => false;
}

class _FavoritesLikesService extends LikesService {
  final _controller = StreamController<LikeSnapshot>();
  final List<_ToggleLike> toggles = [];

  @override
  Stream<LikeSnapshot> streamLikeSnapshot(String userId) => _controller.stream;

  @override
  Future<void> toggleLike({
    required String episodeId,
    required String userId,
    required bool currentlyLiked,
  }) async {
    toggles.add(
      _ToggleLike(
        userId: userId,
        episodeId: episodeId,
        currentlyLiked: currentlyLiked,
      ),
    );
  }

  void addSnapshot(LikeSnapshot snapshot) => _controller.add(snapshot);
}

class _ToggleLike {
  const _ToggleLike({
    required this.userId,
    required this.episodeId,
    required this.currentlyLiked,
  });

  final String userId;
  final String episodeId;
  final bool currentlyLiked;

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        other is _ToggleLike &&
            other.userId == userId &&
            other.episodeId == episodeId &&
            other.currentlyLiked == currentlyLiked;
  }

  @override
  int get hashCode => Object.hash(userId, episodeId, currentlyLiked);

  @override
  String toString() {
    return 'ToggleLike($userId, $episodeId, $currentlyLiked)';
  }
}
