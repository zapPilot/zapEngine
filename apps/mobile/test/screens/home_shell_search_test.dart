import 'package:ai_podcast_mobile/config/app_config.dart';
import 'package:ai_podcast_mobile/models/episode.dart';
import 'package:ai_podcast_mobile/models/episode_page.dart';
import 'package:ai_podcast_mobile/models/episode_search_result.dart';
import 'package:ai_podcast_mobile/screens/home_shell.dart';
import 'package:ai_podcast_mobile/services/episode_service.dart';
import 'package:ai_podcast_mobile/state/content_language_provider.dart';
import 'package:ai_podcast_mobile/state/likes_provider.dart';
import 'package:ai_podcast_mobile/state/playback_provider.dart';
import 'package:ai_podcast_mobile/state/session_provider.dart';
import 'package:ai_podcast_mobile/theme/app_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../fakes/fake_podcast_audio_handler.dart';

void main() {
  testWidgets('labels the second home tab as search', (tester) async {
    SharedPreferences.setMockInitialValues({});
    final episodeService = _EmptyEpisodeService();

    await tester.pumpWidget(
      MultiProvider(
        providers: [
          ChangeNotifierProvider(create: (_) => SessionProvider()),
          ChangeNotifierProvider(create: (_) => ContentLanguageProvider()),
          ChangeNotifierProvider(
            create: (_) => PlaybackProvider(
              FakePodcastAudioHandler(),
              episodeService: episodeService,
            ),
          ),
          ChangeNotifierProvider(create: (_) => LikesProvider()),
        ],
        child: MaterialApp(
          theme: AppTheme.dark(),
          home: HomeShell(episodeService: episodeService),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('搜尋'), findsOneWidget);
    expect(find.byIcon(Icons.search_rounded), findsOneWidget);
    expect(find.text('探索'), findsNothing);
  });
}

class _EmptyEpisodeService extends EpisodeService {
  @override
  Future<EpisodePage> getEpisodes({
    int limit = 20,
    String? cursor,
    String languageCode = AppConfig.contentLanguageCode,
  }) async {
    return const EpisodePage(items: [], nextCursor: null);
  }

  @override
  Future<List<EpisodeSearchResult>> searchEpisodes({
    required String query,
    required String languageCode,
    int limit = 20,
  }) async {
    return const [];
  }

  @override
  Future<List<Episode>> hydrateUserState(
    String userId,
    List<Episode> episodes,
  ) async {
    return episodes;
  }
}
