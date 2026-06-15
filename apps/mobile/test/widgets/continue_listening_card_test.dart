import 'package:ai_podcast_mobile/models/episode.dart';
import 'package:ai_podcast_mobile/state/auth_provider.dart';
import 'package:ai_podcast_mobile/state/likes_provider.dart';
import 'package:ai_podcast_mobile/state/playback_provider.dart';
import 'package:ai_podcast_mobile/theme/app_theme.dart';
import 'package:ai_podcast_mobile/widgets/continue_listening_card.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../fakes/fake_podcast_audio_handler.dart';

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  const viewports = <(String, Size)>[
    ('iPhone SE', Size(320, 568)),
    ('iPhone 13', Size(393, 852)),
    ('iPhone 16 Pro Max', Size(430, 932)),
    ('iPad mini', Size(768, 1024)),
  ];

  for (final (name, size) in viewports) {
    testWidgets(
      'ContinueListeningCard renders without overflow at $name (${size.width.toInt()}x${size.height.toInt()})',
      (tester) async {
        _useViewport(tester, size);

        await _pumpCard(
          tester,
          ContinueListeningCard(
            episode: _episode(title: '德银重磅报告：AI的两个终局——马克思的预言与马斯克的愿景'),
            allCompleted: false,
            isPlaying: false,
            isLoading: false,
            onPlay: () {},
          ),
        );

        expect(tester.takeException(), isNull);
        expect(find.byType(Wrap), findsWidgets);
      },
    );
  }

  testWidgets(
    'ContinueListeningCard renders with the all-completed eyebrow without overflow',
    (tester) async {
      _useViewport(tester, const Size(320, 568));

      await _pumpCard(
        tester,
        ContinueListeningCard(
          episode: _episode(),
          allCompleted: true,
          isPlaying: false,
          isLoading: false,
          onPlay: () {},
        ),
      );

      expect(tester.takeException(), isNull);
      expect(find.text('已全部聽完'), findsWidgets);
    },
  );

  testWidgets('ContinueListeningCard handles a long unbreakable title', (
    tester,
  ) async {
    _useViewport(tester, const Size(320, 568));

    await _pumpCard(
      tester,
      ContinueListeningCard(
        episode: _episode(title: 'A' * 200),
        allCompleted: false,
        isPlaying: false,
        isLoading: false,
        onPlay: () {},
      ),
    );

    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'ContinueListeningCard formats in-progress positions over an hour',
    (tester) async {
      _useViewport(tester, const Size(393, 852));

      await _pumpCard(
        tester,
        ContinueListeningCard(
          episode: _episode().copyWith(lastPositionSeconds: 3661),
          allCompleted: false,
          isPlaying: false,
          isLoading: false,
          onPlay: () {},
        ),
      );

      expect(find.text('上次收聽至 1:01:01'), findsOneWidget);
    },
  );
}

void _useViewport(WidgetTester tester, Size size) {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
}

Future<void> _pumpCard(WidgetTester tester, ContinueListeningCard card) async {
  await tester.pumpWidget(
    MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => AuthProvider()),
        ChangeNotifierProvider(
          create: (_) => PlaybackProvider(FakePodcastAudioHandler()),
        ),
        ChangeNotifierProvider(create: (_) => LikesProvider()),
      ],
      child: MaterialApp(
        theme: AppTheme.dark(),
        home: Scaffold(body: Center(child: card)),
      ),
    ),
  );
  await tester.pump();
}

Episode _episode({String title = 'Test title'}) => Episode(
  id: 'episode-1',
  title: title,
  hlsUrl: 'https://cdn.example.com/episode-1.m3u8',
  createdAt: DateTime(2026, 5, 4),
  listened: false,
  likeCount: 12,
  script: 'Body.',
);
