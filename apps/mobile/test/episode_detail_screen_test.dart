import 'package:ai_podcast_mobile/models/episode.dart';
import 'package:ai_podcast_mobile/screens/episode_detail_screen.dart';
import 'package:ai_podcast_mobile/services/episode_service.dart';
import 'package:ai_podcast_mobile/state/auth_provider.dart';
import 'package:ai_podcast_mobile/state/content_language_provider.dart';
import 'package:ai_podcast_mobile/state/likes_provider.dart';
import 'package:ai_podcast_mobile/state/playback_provider.dart';
import 'package:ai_podcast_mobile/theme/app_theme.dart';
import 'package:ai_podcast_mobile/widgets/continue_listening_card.dart';
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

  testWidgets('EpisodeCard opens the detail screen with transcript', (
    tester,
  ) async {
    final episode = _episode(script: 'Full transcript body.');

    await _pumpHarness(
      tester,
      EpisodeCard(
        episode: episode,
        isPlaying: false,
        isLoading: false,
        onPlay: () {},
      ),
    );

    expect(find.byType(EpisodeDetailScreen), findsNothing);
    expect(find.text('Transcript'), findsNothing);

    await tester.tap(find.byType(EpisodeCard));
    await tester.pumpAndSettle();

    expect(find.byType(EpisodeDetailScreen), findsOneWidget);
    expect(find.text('Transcript'), findsOneWidget);
    expect(find.text('Full transcript body.'), findsOneWidget);
  });

  testWidgets('ContinueListeningCard opens the detail screen', (tester) async {
    final episode = _episode(title: 'Latest macro cycle');

    await _pumpHarness(
      tester,
      ContinueListeningCard(
        episode: episode,
        allCompleted: false,
        isPlaying: false,
        isLoading: false,
        onPlay: () {},
      ),
    );

    await tester.tap(find.byType(ContinueListeningCard));
    await tester.pumpAndSettle();

    expect(find.byType(EpisodeDetailScreen), findsOneWidget);
    expect(find.text('Latest macro cycle'), findsWidgets);
  });

  testWidgets('Episode detail speed menu updates playback speed', (
    tester,
  ) async {
    final handler = FakePodcastAudioHandler();
    final provider = PlaybackProvider(handler);

    await _pumpHarness(
      tester,
      EpisodeDetailScreen(episode: _episode()),
      playbackProvider: provider,
    );

    expect(find.text('1.0x'), findsOneWidget);

    await tester.tap(find.byTooltip('Playback speed'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('1.5x').last);
    await tester.pumpAndSettle();

    expect(handler.speed, 1.5);
    expect(find.text('1.5x'), findsOneWidget);

    provider.dispose();
    await handler.dispose();
  });

  testWidgets('Episode detail shows language pill and switches tracks', (
    tester,
  ) async {
    final handler = FakePodcastAudioHandler();
    final provider = PlaybackProvider(handler);
    final episode = _episodeWithTracks();

    await _pumpHarness(
      tester,
      EpisodeDetailScreen(episode: episode),
      playbackProvider: provider,
    );

    expect(find.text('繁中'), findsOneWidget);
    expect(find.text('EN'), findsOneWidget);
    expect(find.text('日本語'), findsOneWidget);

    await tester.tap(find.byTooltip('Play'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('EN'));
    await tester.pumpAndSettle();

    expect(provider.currentAudioTrack, episode.audioTracks[1]);
    expect(handler.currentAudioTrack, episode.audioTracks[1]);

    provider.dispose();
    await handler.dispose();
  });

  testWidgets('Episode detail play button is enabled for unplayed episodes', (
    tester,
  ) async {
    final handler = FakePodcastAudioHandler();
    final provider = PlaybackProvider(handler);
    final episode = _episode();

    await _pumpHarness(
      tester,
      EpisodeDetailScreen(episode: episode),
      playbackProvider: provider,
    );

    await tester.tap(find.byTooltip('Play'));
    await tester.pumpAndSettle();

    expect(handler.loadedEpisodeIds, ['episode-1']);
    expect(handler.playCount, 1);

    provider.dispose();
    await handler.dispose();
  });

  testWidgets('Episode detail does not show manual listened action', (
    tester,
  ) async {
    await _pumpHarness(tester, EpisodeDetailScreen(episode: _episode()));

    expect(find.text('Mark played'), findsNothing);
    expect(find.text('Played'), findsNothing);
  });

  testWidgets('Episode detail shows language chips for fallback-only audio', (
    tester,
  ) async {
    await _pumpHarness(tester, EpisodeDetailScreen(episode: _episode()));

    expect(find.text('中'), findsOneWidget);
    expect(find.text('EN'), findsOneWidget);
    expect(find.text('日'), findsOneWidget);
  });

  testWidgets('Episode detail language chip loads selected localization', (
    tester,
  ) async {
    final languageProvider = ContentLanguageProvider();
    final service = _DetailEpisodeService(
      localizedEpisode: _episode(title: 'English liquidity watch').copyWith(
        languageCode: 'en',
      ),
    );

    await _pumpHarness(
      tester,
      EpisodeDetailScreen(
        episode: _episode(),
        episodeService: service,
      ),
      languageProvider: languageProvider,
    );

    await tester.tap(find.text('EN'));
    await tester.pumpAndSettle();

    expect(languageProvider.languageCode, 'en');
    expect(service.requests, [const _EpisodeRequest('episode-1', 'en')]);
    expect(find.text('English liquidity watch'), findsWidgets);
  });

  testWidgets(
      'Episode detail keeps current localization when selected one is missing',
      (
    tester,
  ) async {
    final languageProvider = ContentLanguageProvider();
    final service = _DetailEpisodeService(localizedEpisode: null);

    await _pumpHarness(
      tester,
      EpisodeDetailScreen(
        episode: _episode(),
        episodeService: service,
      ),
      languageProvider: languageProvider,
    );

    await tester.tap(find.text('EN'));
    await tester.pumpAndSettle();

    expect(languageProvider.languageCode, 'zh-Hant');
    expect(service.requests, [const _EpisodeRequest('episode-1', 'en')]);
    expect(find.text('Treasury liquidity watch'), findsWidgets);
    expect(find.text('此集數尚未提供所選語言版本。'), findsOneWidget);
  });

  testWidgets(
      'Episode detail language chips use the displayed episode language', (
    tester,
  ) async {
    final languageProvider = ContentLanguageProvider();
    await languageProvider.setLanguageCode('en');
    final service = _DetailEpisodeService(
      localizedEpisode: _episode(title: 'English liquidity watch').copyWith(
        languageCode: 'en',
      ),
    );

    await _pumpHarness(
      tester,
      EpisodeDetailScreen(
        episode: _episode(),
        episodeService: service,
      ),
      languageProvider: languageProvider,
    );

    await tester.tap(find.text('EN'));
    await tester.pumpAndSettle();

    expect(service.requests, [const _EpisodeRequest('episode-1', 'en')]);
    expect(find.text('English liquidity watch'), findsWidgets);
  });

  testWidgets('Episode detail shows language classroom lessons', (
    tester,
  ) async {
    await _pumpHarness(
      tester,
      EpisodeDetailScreen(episode: _episodeWithLanguageClassroom()),
    );

    expect(find.text('Language Classroom'), findsOneWidget);
    expect(find.text('JP'), findsOneWidget);
    expect(find.text('この記事は市場流動性を説明します。'), findsOneWidget);
    expect(find.text('流動性'), findsOneWidget);
    expect(find.textContaining('資金容易進出市場的程度'), findsOneWidget);
  });
}

Future<void> _pumpHarness(
  WidgetTester tester,
  Widget child, {
  PlaybackProvider? playbackProvider,
  ContentLanguageProvider? languageProvider,
}) async {
  await tester.pumpWidget(
    MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => AuthProvider()),
        ChangeNotifierProvider<ContentLanguageProvider>.value(
          value: languageProvider ?? ContentLanguageProvider(),
        ),
        if (playbackProvider == null)
          ChangeNotifierProvider(
            create: (_) => PlaybackProvider(FakePodcastAudioHandler()),
          )
        else
          ChangeNotifierProvider.value(value: playbackProvider),
        ChangeNotifierProvider(create: (_) => LikesProvider()),
      ],
      child: MaterialApp(
        theme: AppTheme.dark(),
        home: Scaffold(body: Center(child: child)),
      ),
    ),
  );
  await tester.pump();
}

class _DetailEpisodeService extends EpisodeService {
  _DetailEpisodeService({required this.localizedEpisode});

  final Episode? localizedEpisode;
  final List<_EpisodeRequest> requests = [];

  @override
  Future<Episode?> getEpisodeById(
    String id, {
    String languageCode = 'zh-Hant',
  }) async {
    requests.add(_EpisodeRequest(id, languageCode));
    return localizedEpisode;
  }
}

class _EpisodeRequest {
  const _EpisodeRequest(this.id, this.languageCode);

  final String id;
  final String languageCode;

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        other is _EpisodeRequest &&
            other.id == id &&
            other.languageCode == languageCode;
  }

  @override
  int get hashCode => Object.hash(id, languageCode);

  @override
  String toString() => 'EpisodeRequest($id, $languageCode)';
}

Episode _episodeWithTracks() {
  return _episode().copyWith(
    audioTracks: const [
      AudioTrack(
        languageCode: 'zh-Hant',
        title: '繁中',
        hlsUrl: 'https://cdn.example.com/episode-1-zh.m3u8',
      ),
      AudioTrack(
        languageCode: 'en',
        title: 'EN',
        hlsUrl: 'https://cdn.example.com/episode-1-en.m3u8',
      ),
      AudioTrack(
        languageCode: 'ja',
        title: '日本語',
        hlsUrl: 'https://cdn.example.com/episode-1-ja.m3u8',
      ),
    ],
  );
}

Episode _episode({
  String title = 'Treasury liquidity watch',
  String? script = 'Line one.\nLine two.',
}) {
  return Episode(
    id: 'episode-1',
    title: title,
    hlsUrl: 'https://cdn.example.com/episode-1.m3u8',
    createdAt: DateTime(2026, 5, 4),
    listened: false,
    likeCount: 123,
    script: script,
  );
}

Episode _episodeWithLanguageClassroom() {
  return _episode().copyWith(
    languageClassrooms: const [
      LanguageClassroomLesson(
        sourceLanguageCode: 'zh-Hant',
        targetLanguageCode: 'ja',
        oneLiner: 'この記事は市場流動性を説明します。',
        keywords: [
          LanguageClassroomKeyword(
            term: '流動性',
            reading: 'りゅうどうせい',
            meaning: '資金容易進出市場的程度',
            note: '市場分析常用詞',
          ),
        ],
      ),
    ],
  );
}
