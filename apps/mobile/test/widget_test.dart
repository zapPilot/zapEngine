import 'package:ai_podcast_mobile/main.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'fakes/fake_podcast_audio_handler.dart';

void main() {
  testWidgets('shows branded auth gate', (tester) async {
    SharedPreferences.setMockInitialValues({});

    await tester.pumpWidget(
      AiPodcastApp(
        supabaseConfigured: false,
        audioHandler: FakePodcastAudioHandler(),
      ),
    );

    await tester.pump();
    expect(find.text('From Fed to Chain'), findsWidgets);
    expect(find.byIcon(Icons.graphic_eq_rounded), findsOneWidget);
  });
}
