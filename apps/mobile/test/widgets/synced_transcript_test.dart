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

    expect(find.text('00:30'), findsOneWidget);

    await tester.tap(find.text('bbbb'));
    await tester.pump();

    expect(handler.seekPositions.last, const Duration(seconds: 30));

    provider.dispose();
    await handler.dispose();
  });
}
