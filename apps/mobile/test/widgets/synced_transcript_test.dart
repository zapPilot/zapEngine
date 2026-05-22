import 'package:ai_podcast_mobile/models/episode.dart';
import 'package:ai_podcast_mobile/state/playback_provider.dart';
import 'package:ai_podcast_mobile/theme/app_theme.dart';
import 'package:ai_podcast_mobile/widgets/synced_transcript.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../fakes/fake_podcast_audio_handler.dart';

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  group('SyncedTranscript', () {
    testWidgets('tap seeks to the estimated segment start', (tester) async {
      final handler = FakePodcastAudioHandler();
      final provider = PlaybackProvider(handler);
      final episode = Episode(
        id: 'episode-1',
        title: 'Treasury liquidity watch',
        hlsUrl: 'https://cdn.example.com/episode-1.m3u8',
        createdAt: DateTime(2026, 5, 4),
        listened: false,
        script: 'aaaa\n\nbbbb',
      );

      await provider.toggle(episode);
      handler.emitDuration(const Duration(seconds: 60));

      await tester.pumpWidget(
        ChangeNotifierProvider.value(
          value: provider,
          child: MaterialApp(
            theme: AppTheme.dark(),
            home: Scaffold(body: SyncedTranscript(episode: episode)),
          ),
        ),
      );
      await tester.pump();

      expect(find.text('0:30'), findsOneWidget);

      await tester.tap(find.text('bbbb'));
      await tester.pump();

      expect(handler.seekPositions.last, const Duration(seconds: 30));

      provider.dispose();
      await handler.dispose();
    });

    testWidgets('displays plain transcript when no script timing', (
      tester,
    ) async {
      final handler = FakePodcastAudioHandler();
      final provider = PlaybackProvider(handler);
      final episode = Episode(
        id: 'episode-2',
        title: 'Test Episode',
        hlsUrl: 'https://cdn.example.com/episode-2.m3u8',
        createdAt: DateTime(2026, 5, 5),
        listened: false,
        script: 'Plain transcript text',
      );

      await provider.toggle(episode);

      await tester.pumpWidget(
        ChangeNotifierProvider.value(
          value: provider,
          child: MaterialApp(
            theme: AppTheme.dark(),
            home: Scaffold(body: SyncedTranscript(episode: episode)),
          ),
        ),
      );
      await tester.pump();

      expect(find.text('Plain transcript text'), findsOneWidget);
      expect(find.text('Transcript'), findsOneWidget);

      provider.dispose();
      await handler.dispose();
    });

    testWidgets('shows "No script available yet" when script is null', (
      tester,
    ) async {
      final handler = FakePodcastAudioHandler();
      final provider = PlaybackProvider(handler);
      final episode = Episode(
        id: 'episode-3',
        title: 'No Script Episode',
        hlsUrl: 'https://cdn.example.com/episode-3.m3u8',
        createdAt: DateTime(2026, 5, 6),
        listened: false,
        script: null,
      );

      await provider.toggle(episode);

      await tester.pumpWidget(
        ChangeNotifierProvider.value(
          value: provider,
          child: MaterialApp(
            theme: AppTheme.dark(),
            home: Scaffold(body: SyncedTranscript(episode: episode)),
          ),
        ),
      );
      await tester.pump();

      expect(find.text('No script available yet.'), findsOneWidget);

      provider.dispose();
      await handler.dispose();
    });

    testWidgets('shows "No script available yet" when script is empty', (
      tester,
    ) async {
      final handler = FakePodcastAudioHandler();
      final provider = PlaybackProvider(handler);
      final episode = Episode(
        id: 'episode-4',
        title: 'Empty Script Episode',
        hlsUrl: 'https://cdn.example.com/episode-4.m3u8',
        createdAt: DateTime(2026, 5, 7),
        listened: false,
        script: '   ',
      );

      await provider.toggle(episode);

      await tester.pumpWidget(
        ChangeNotifierProvider.value(
          value: provider,
          child: MaterialApp(
            theme: AppTheme.dark(),
            home: Scaffold(body: SyncedTranscript(episode: episode)),
          ),
        ),
      );
      await tester.pump();

      expect(find.text('No script available yet.'), findsOneWidget);

      provider.dispose();
      await handler.dispose();
    });

    testWidgets('displays Transcript header', (tester) async {
      final handler = FakePodcastAudioHandler();
      final provider = PlaybackProvider(handler);
      final episode = Episode(
        id: 'episode-5',
        title: 'Header Test',
        hlsUrl: 'https://cdn.example.com/episode-5.m3u8',
        createdAt: DateTime(2026, 5, 8),
        listened: false,
        script: 'Some script',
      );

      await provider.toggle(episode);

      await tester.pumpWidget(
        ChangeNotifierProvider.value(
          value: provider,
          child: MaterialApp(
            theme: AppTheme.dark(),
            home: Scaffold(body: SyncedTranscript(episode: episode)),
          ),
        ),
      );
      await tester.pump();

      expect(find.text('Transcript'), findsOneWidget);

      provider.dispose();
      await handler.dispose();
    });

    testWidgets('uses different episode when switching', (tester) async {
      final handler = FakePodcastAudioHandler();
      final provider = PlaybackProvider(handler);
      final episode1 = Episode(
        id: 'episode-a',
        title: 'Episode A',
        hlsUrl: 'https://cdn.example.com/episode-a.m3u8',
        createdAt: DateTime(2026, 5, 10),
        listened: false,
        script: 'script for episode A',
      );

      await provider.toggle(episode1);

      await tester.pumpWidget(
        ChangeNotifierProvider.value(
          value: provider,
          child: MaterialApp(
            theme: AppTheme.dark(),
            home: Scaffold(body: SyncedTranscript(episode: episode1)),
          ),
        ),
      );
      await tester.pump();

      expect(find.text('script for episode A'), findsOneWidget);

      final episode2 = Episode(
        id: 'episode-b',
        title: 'Episode B',
        hlsUrl: 'https://cdn.example.com/episode-b.m3u8',
        createdAt: DateTime(2026, 5, 11),
        listened: false,
        script: 'script for episode B',
      );

      await tester.pumpWidget(
        ChangeNotifierProvider.value(
          value: provider,
          child: MaterialApp(
            theme: AppTheme.dark(),
            home: Scaffold(body: SyncedTranscript(episode: episode2)),
          ),
        ),
      );
      await tester.pump();

      expect(find.text('script for episode B'), findsOneWidget);

      provider.dispose();
      await handler.dispose();
    });
  });
}
