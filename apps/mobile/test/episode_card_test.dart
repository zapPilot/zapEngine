import 'package:ai_podcast_mobile/models/episode.dart';
import 'package:ai_podcast_mobile/services/auth_service.dart';
import 'package:ai_podcast_mobile/services/likes_service.dart';
import 'package:ai_podcast_mobile/state/auth_provider.dart';
import 'package:ai_podcast_mobile/state/likes_provider.dart';
import 'package:ai_podcast_mobile/theme/app_theme.dart';
import 'package:ai_podcast_mobile/widgets/episode_card.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  testWidgets('unplayed episode play button invokes onPlay', (tester) async {
    var playCount = 0;

    await _pumpEpisodeCard(
      tester,
      Episode(
        id: 'episode-unplayed',
        title: 'Unplayed liquidity watch',
        hlsUrl: 'https://cdn.example.com/episode-unplayed.m3u8',
        createdAt: DateTime(2026, 5, 4),
        listened: false,
      ),
      onPlay: () => playCount += 1,
    );

    await tester.tap(find.byIcon(Icons.play_arrow_rounded));
    await tester.pump();

    expect(playCount, 1);
  });
}

Future<void> _pumpEpisodeCard(
  WidgetTester tester,
  Episode episode, {
  required VoidCallback onPlay,
}) async {
  final authProvider = AuthProvider(authService: _FakeAuthService());
  await authProvider.restore();

  await tester.pumpWidget(
    MultiProvider(
      providers: [
        ChangeNotifierProvider<AuthProvider>.value(value: authProvider),
        ChangeNotifierProvider(
          create: (_) => LikesProvider(likesService: _EmptyLikesService()),
        ),
      ],
      child: MaterialApp(
        theme: AppTheme.dark(),
        home: Scaffold(
          body: EpisodeCard(
            episode: episode,
            isPlaying: false,
            isLoading: false,
            onPlay: onPlay,
          ),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

class _FakeAuthService extends AuthService {
  @override
  Future<PodcastUser?> restoreUser() async => null;

  @override
  Future<bool> canUseBiometrics() async => false;
}

class _EmptyLikesService extends LikesService {
  @override
  Stream<LikeSnapshot> streamLikeSnapshot(String userId) {
    return const Stream.empty();
  }
}
