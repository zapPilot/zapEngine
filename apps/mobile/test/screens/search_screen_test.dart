import 'package:ai_podcast_mobile/models/episode.dart';
import 'package:ai_podcast_mobile/models/episode_search_result.dart';
import 'package:ai_podcast_mobile/screens/episode_detail_screen.dart';
import 'package:ai_podcast_mobile/screens/search_screen.dart';
import 'package:ai_podcast_mobile/services/episode_service.dart';
import 'package:ai_podcast_mobile/services/likes_service.dart';
import 'package:ai_podcast_mobile/state/content_language_provider.dart';
import 'package:ai_podcast_mobile/state/episode_search_controller.dart';
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
  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  testWidgets('shows idle guidance then renders a matched result', (
    tester,
  ) async {
    final service = _SearchEpisodeService(
      results: [
        _result(
          title: 'Treasury liquidity watch',
          snippet: 'Treasury cash moved through funding markets.',
        ),
      ],
    );

    await _pumpSearch(tester, service);

    expect(find.text('搜尋節目內容'), findsOneWidget);

    await tester.enterText(
      find.byType(TextField),
      'treasury liquidity',
    );
    await tester.pumpAndSettle();

    expect(find.text('Treasury liquidity watch'), findsOneWidget);
    expect(find.text('標題'), findsOneWidget);
    expect(
      find.text('Treasury cash moved through funding markets.'),
      findsOneWidget,
    );
    expect(find.byIcon(Icons.bookmark_border_rounded), findsOneWidget);
  });

  testWidgets('shows an empty state when no episodes match', (tester) async {
    await _pumpSearch(tester, _SearchEpisodeService());

    await tester.enterText(find.byType(TextField), 'nothing matches');
    await tester.pumpAndSettle();

    expect(find.text('找不到相關集數'), findsOneWidget);
    expect(find.text('換個關鍵字試試。'), findsOneWidget);
  });

  testWidgets('shows an error and retries the same query', (tester) async {
    final service = _SearchEpisodeService(
      errorsBeforeSuccess: 1,
      results: [_result(title: 'Recovered result')],
    );
    await _pumpSearch(tester, service);

    await tester.enterText(find.byType(TextField), 'liquidity');
    await tester.pumpAndSettle();

    expect(find.textContaining('offline'), findsOneWidget);

    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();

    expect(find.text('Recovered result'), findsOneWidget);
    expect(service.queries, ['liquidity', 'liquidity']);
  });

  testWidgets('opens details and plays a search result', (tester) async {
    final handler = FakePodcastAudioHandler();
    final service = _SearchEpisodeService(
      results: [_result(title: 'Playable result')],
    );
    await _pumpSearch(tester, service, audioHandler: handler);

    await tester.enterText(find.byType(TextField), 'playable');
    await tester.pumpAndSettle();

    await tester.tap(find.byTooltip('Play'));
    await tester.pumpAndSettle();
    expect(handler.loadedEpisodeIds, ['episode-1']);

    await tester.tap(find.text('Playable result'));
    await tester.pumpAndSettle();
    expect(find.byType(EpisodeDetailScreen), findsOneWidget);

    await handler.dispose();
  });

  testWidgets('re-runs the current query when content language changes', (
    tester,
  ) async {
    final languageProvider = ContentLanguageProvider();
    final service = _SearchEpisodeService();
    await _pumpSearch(
      tester,
      service,
      languageProvider: languageProvider,
    );

    await tester.enterText(find.byType(TextField), 'liquidity');
    await tester.pumpAndSettle();
    await languageProvider.setLanguageCode('ja');
    await tester.pumpAndSettle();

    expect(service.languages, ['zh-Hant', 'ja']);
  });
}

Future<void> _pumpSearch(
  WidgetTester tester,
  _SearchEpisodeService episodeService, {
  FakePodcastAudioHandler? audioHandler,
  ContentLanguageProvider? languageProvider,
}) async {
  final sessionProvider = SessionProvider(
    initialProfile: const ListenerProfile(id: 'user-1'),
  );
  final handler = audioHandler ?? FakePodcastAudioHandler();
  final controller = EpisodeSearchController(
    episodeService: episodeService,
    debounceDuration: Duration.zero,
  );

  await tester.pumpWidget(
    MultiProvider(
      providers: [
        ChangeNotifierProvider<SessionProvider>.value(value: sessionProvider),
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
        home: SearchScreen(controller: controller),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

EpisodeSearchResult _result({
  String title = 'Search result',
  String? snippet = 'Snippet',
}) {
  return EpisodeSearchResult(
    episode: Episode(
      id: 'episode-1',
      title: title,
      hlsUrl: 'https://cdn.example.com/episode-1.m3u8',
      createdAt: DateTime(2026, 6),
      listened: false,
      script: 'Full transcript body.',
    ),
    matchSource: EpisodeSearchMatchSource.title,
    snippet: snippet,
  );
}

class _SearchEpisodeService extends EpisodeService {
  _SearchEpisodeService({
    this.results = const [],
    this.errorsBeforeSuccess = 0,
  });

  final List<EpisodeSearchResult> results;
  int errorsBeforeSuccess;
  final List<String> queries = [];
  final List<String> languages = [];

  @override
  Future<List<EpisodeSearchResult>> searchEpisodes({
    required String query,
    required String languageCode,
    int limit = 20,
  }) async {
    queries.add(query);
    languages.add(languageCode);
    if (errorsBeforeSuccess > 0) {
      errorsBeforeSuccess -= 1;
      throw Exception('offline');
    }
    return results;
  }
}

class _EmptyLikesService extends LikesService {
  @override
  Stream<LikeSnapshot> streamLikeSnapshot(String userId) {
    return const Stream.empty();
  }
}
