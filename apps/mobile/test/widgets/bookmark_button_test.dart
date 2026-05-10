import 'package:ai_podcast_mobile/models/episode.dart';
import 'package:ai_podcast_mobile/services/auth_service.dart';
import 'package:ai_podcast_mobile/services/likes_service.dart';
import 'package:ai_podcast_mobile/state/auth_provider.dart';
import 'package:ai_podcast_mobile/state/likes_provider.dart';
import 'package:ai_podcast_mobile/theme/app_theme.dart';
import 'package:ai_podcast_mobile/widgets/bookmark_button.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  testWidgets('toggles the like-backed bookmark without showing a count', (
    tester,
  ) async {
    final likesService = _RecordingLikesService();
    final episode = Episode(
      id: 'episode-1',
      title: 'Treasury liquidity watch',
      hlsUrl: 'https://cdn.example.com/episode-1.m3u8',
      createdAt: DateTime(2026, 5, 4),
      listened: false,
      likeCount: 7,
    );

    await _pumpBookmarkButton(tester, episode, likesService);

    expect(find.byIcon(Icons.bookmark_border_rounded), findsOneWidget);
    expect(find.text('7'), findsNothing);

    await tester.tap(find.byTooltip('Save to favorites'));
    await tester.pumpAndSettle();

    expect(likesService.toggles, [
      const _ToggleLike(
        userId: 'user-1',
        episodeId: 'episode-1',
        currentlyLiked: false,
      ),
    ]);
    expect(find.byIcon(Icons.bookmark_rounded), findsOneWidget);
  });
}

Future<void> _pumpBookmarkButton(
  WidgetTester tester,
  Episode episode,
  _RecordingLikesService likesService,
) async {
  final authProvider = AuthProvider(
    authService: _FakeAuthService(
      const PodcastUser(id: 'user-1', displayName: 'Test User'),
    ),
  );
  await authProvider.restore();

  await tester.pumpWidget(
    MultiProvider(
      providers: [
        ChangeNotifierProvider<AuthProvider>.value(value: authProvider),
        ChangeNotifierProvider(
          create: (_) => LikesProvider(likesService: likesService),
        ),
      ],
      child: MaterialApp(
        theme: AppTheme.dark(),
        home: Scaffold(body: BookmarkButton(episode: episode)),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

class _FakeAuthService extends AuthService {
  _FakeAuthService(this.user);

  final PodcastUser user;

  @override
  Future<PodcastUser?> restoreUser() async => user;

  @override
  Future<bool> canUseBiometrics() async => false;
}

class _RecordingLikesService extends LikesService {
  final List<_ToggleLike> toggles = [];

  @override
  Stream<LikeSnapshot> streamLikeSnapshot(String userId) {
    return const Stream.empty();
  }

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
